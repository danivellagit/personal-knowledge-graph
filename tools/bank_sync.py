#!/usr/bin/env python3
"""Read-only bank sync through Enable Banking (PSD2 account information), for any bank Enable Banking supports.

Optional banks section (data/finance/banks/README.md). Balances and transactions only: the AIS service it uses
cannot move money. Raw movements (bank ids, full account numbers, balances) stay in a PRIVATE folder outside the
repo; the repo gets, per bank, under data/finance/banks/<bank>/: monthly totals, the account card and one SANITIZED
transaction file per month (tools/bank_export.py: no card numbers, IBANs as last 4 only, no bank reference ids).
One Enable Banking application (your own, registered once: docs/setup/bank-enable-banking.md) serves every bank;
each bank you link is a <bank> slug with its own consent (max 180 days, often less: the bank decides).

  python3 tools/bank_sync.py setup --app-id <uuid> [--key <path to the .pem>] [--redirect-url URL] [--no-verify]
  python3 tools/bank_sync.py banks --country IT [--find "my bank"]    # the bank names Enable Banking offers
  python3 tools/bank_sync.py auth --bank mybank --aspsp "My Bank" --country IT   # prints the consent link
  python3 tools/bank_sync.py auth --bank mybank --code '<the address you landed on>'   # session + full history
  python3 tools/bank_sync.py sync [--bank mybank]       # unattended: balances + new transactions (all banks)
  python3 tools/bank_sync.py status [--bank mybank]     # consent days left, last sync (no secrets printed)
  python3 tools/bank_sync.py export [--bank mybank]     # rebuild the repo files from the private raw copy
Global flags: --mock (fake API, no network), --dry-run (no files written).

Files (every path can be set in config.local.yml, `banks:` block, or by the env var)
  secrets  <banks.secrets_dir | EB_SECRETS_DIR, default ~/.secrets/enablebanking>/   (700, files 600)
             private.key        the application's private key (never printed, never copied into the repo)
             app.json           app_id, redirect_url
             banks/<bank>.json  the bank, the session, the masked account labels
  private  <banks.private_dir | EB_PRIVATE_DIR, default ~/private/finance>/<bank>/   (700)
             raw/transactions-YYYY-MM.csv, balances.json, state.json
  repo     <EB_REPO_DIR, default data/finance/banks>/<bank>/
             monthly-totals.{md,json}, accounts.md, transactions/<bank>-YYYY-MM.md (sanitized)

Exit codes: 0 ok | 1 error | 2 not configured | 3 RENEW NEEDED (consent expired/revoked) |
            4 bank rate limit / temporary bank error, retry in ~6 h | 5 status: renewal due in <= 14 days
Never prints the private key, the JWT, the session id in full, IBANs or counterparties.
Needs `requests` and `PyJWT` (pip install requests pyjwt cryptography) for real calls; --mock needs neither.
"""

import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import os
import re
import sys
import time
import uuid
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import bank_export  # noqa: E402  sanitized monthly transaction files
import config  # noqa: E402

API = "https://api.enablebanking.com"
DEFAULT_REDIRECT = "https://localhost/bank-callback"
MAX_DAYS = 180
OVERLAP_DAYS = 7          # each sync re-reads the last week: pending -> booked, late postings
WARN_DAYS = 14
RENEW_ERRORS = {"EXPIRED_SESSION", "REVOKED_SESSION", "CLOSED_SESSION", "SESSION_DOES_NOT_EXIST",
                "WRONG_SESSION_STATUS", "ASPSP_PSU_ACTION_REQUIRED", "UNAUTHORIZED_ACCESS",
                "NO_ACCOUNTS_ADDED"}
TEMP_ERRORS = {"ASPSP_RATE_LIMIT_EXCEEDED", "ASPSP_TIMEOUT", "ASPSP_ERROR"}
CSV_FIELDS = ["key", "transaction_id", "entry_reference", "account", "status", "booking_date",
              "value_date", "transaction_date", "direction", "amount", "currency", "counterparty",
              "description", "mcc", "bank_tx_code", "balance_after"]
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,40}$")

DRY = False


def paths():
    secrets = os.path.expanduser(config.get("banks.secrets_dir", "~/.secrets/enablebanking", "EB_SECRETS_DIR"))
    private = os.path.expanduser(config.get("banks.private_dir", "~/private/finance", "EB_PRIVATE_DIR"))
    repo = os.path.expanduser(os.environ.get("EB_REPO_DIR") or os.path.join(ROOT, "data", "finance", "banks"))
    return secrets, private, repo


SECRETS, PRIVATE_ROOT, REPO_DIR = paths()


class Fail(Exception):
    def __init__(self, code, msg):
        super().__init__(msg)
        self.code = code


# ---------------------------------------------------------------- files

def now():
    return dt.datetime.now(dt.timezone.utc)


def load_json(path, default):
    try:
        with open(path, encoding="utf8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return default


def write_file(path, text, mode=0o600):
    if DRY:
        print("dry-run: would write %s (%d bytes)" % (path, len(text)))
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    with os.fdopen(fd, "w", encoding="utf8", newline="") as fh:
        fh.write(text)
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def save_json(path, data, mode=0o600):
    write_file(path, json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True) + "\n", mode)


def inside_repo(p):
    real = os.path.realpath(p)
    return real == ROOT or real.startswith(ROOT + os.sep)


def secure_dir(d):
    if DRY:
        return
    os.makedirs(d, mode=0o700, exist_ok=True)
    os.chmod(d, 0o700)


def app_path():
    return os.path.join(SECRETS, "app.json")


def load_app():
    return load_json(app_path(), {})


def save_app(app):
    if inside_repo(SECRETS):
        raise Fail(1, "secrets folder %s is inside the repo: refusing" % SECRETS)
    secure_dir(SECRETS)
    save_json(app_path(), app)


def check_slug(bank):
    if not bank or not SLUG.match(bank):
        raise Fail(1, "--bank must be a short slug: lowercase letters, digits, dashes (e.g. mybank, savings-bank)")
    return bank


def bank_cfg_path(bank):
    return os.path.join(SECRETS, "banks", "%s.json" % bank)


def load_bank(bank):
    return load_json(bank_cfg_path(bank), {})


def save_bank(bank, cfg):
    secure_dir(SECRETS)
    secure_dir(os.path.join(SECRETS, "banks"))
    save_json(bank_cfg_path(bank), cfg)


def known_banks():
    d = os.path.join(SECRETS, "banks")
    if not os.path.isdir(d):
        return []
    return sorted(f[:-5] for f in os.listdir(d) if f.endswith(".json") and SLUG.match(f[:-5]))


def private_dir(bank):
    return os.path.join(PRIVATE_ROOT, bank)


def ensure_private(bank):
    d = private_dir(bank)
    if inside_repo(d):
        raise Fail(1, "private folder %s is inside the repo: refusing (set banks.private_dir outside it)" % d)
    for x in (PRIVATE_ROOT, d, os.path.join(d, "raw")):
        secure_dir(x)


def repo_dir(bank):
    return os.path.join(REPO_DIR, bank)


def short(s):
    return (s or "")[:8] + "..." if s else "-"


# ---------------------------------------------------------------- API

class Api:
    def __init__(self, app, mock=False):
        self.app = app
        self.mock = MockApi() if mock else None

    def _jwt(self):
        import jwt  # PyJWT
        app_id = self.app.get("app_id")
        if not app_id:
            raise Fail(2, "no app_id: run  python3 tools/bank_sync.py setup --app-id <uuid>  first "
                          "(docs/setup/bank-enable-banking.md)")
        keyfile = os.path.join(SECRETS, "private.key")
        if not os.path.exists(keyfile):
            raise Fail(2, "missing %s (setup --key <the .pem you downloaded>)" % keyfile)
        with open(keyfile, "rb") as fh:
            key = fh.read()
        iat = int(time.time())
        return jwt.encode({"iss": "enablebanking.com", "aud": "api.enablebanking.com",
                           "iat": iat, "exp": iat + 3600}, key, algorithm="RS256",
                          headers={"kid": app_id})

    def call(self, method, path, params=None, body=None):
        if self.mock:
            status, data = self.mock.handle(method, path, params or {}, body)
        else:
            try:
                import requests
            except ImportError:
                raise Fail(2, "python package `requests` missing: pip install requests pyjwt cryptography")
            try:
                r = requests.request(method, API + path, params=params, json=body, timeout=60,
                                     headers={"Authorization": "Bearer " + self._jwt(),
                                              "Accept": "application/json"})
            except requests.RequestException as e:
                raise Fail(4, "network error talking to Enable Banking: %s" % type(e).__name__)
            status = r.status_code
            try:
                data = r.json()
            except ValueError:
                data = {"message": r.text[:200]}
        if status >= 400:
            err = (data or {}).get("error") or ""
            msg = (data or {}).get("message") or ""
            what = path.split("?")[0].split("/")[1]
            if err in RENEW_ERRORS:
                raise Fail(3, "%s %s: %s %s" % (method, what, err, msg))
            if status == 429 or err in TEMP_ERRORS:
                raise Fail(4, "%s (HTTP %d): bank limit or temporary bank error, retry in ~6 h" % (err or "rate limit", status))
            if status in (401, 403) and not err:
                raise Fail(2, "HTTP %d from Enable Banking: app not active, wrong app_id or key" % status)
            raise Fail(1, "HTTP %d %s %s: %s %s" % (status, method, what, err, msg))
        return data


class MockApi:
    """Fake Enable Banking responses for tests (no network). Invented bank, invented values."""
    def __init__(self):
        self.today = dt.date.today()

    def _tx(self, i, days_ago, amount, cur, direction, mcc=None, status="BOOK", tid=True):
        d = (self.today - dt.timedelta(days=days_ago)).isoformat()
        return {"transaction_id": ("tx-%s-%d" % (cur, i)) if tid else None, "entry_reference": "ref%d" % i,
                "transaction_amount": {"currency": cur, "amount": "%.2f" % amount},
                "credit_debit_indicator": direction, "status": status, "booking_date": d,
                "value_date": d, "transaction_date": d, "merchant_category_code": mcc,
                "creditor": {"name": "Mock Shop %d" % i} if direction == "DBIT" else None,
                "debtor": {"name": "Mock Payer %d" % i} if direction == "CRDT" else None,
                "remittance_information": ["mock payment %d" % i] if i != 3 else
                ["To IT60X0542811101000000123456 card 4111 1111 1111 1111 MB:3f2a9c1e-1b2c-4d5e-8f90-1a2b3c4d5e6f"]}

    def handle(self, method, path, params, body):
        if path == "/application":
            return 200, {"name": "my-bank-sync", "environment": "PRODUCTION", "active": True,
                         "kid": "mock", "redirect_urls": [DEFAULT_REDIRECT], "countries": ["XX"], "services": ["AIS"]}
        if path == "/aspsps":
            return 200, {"aspsps": [{"name": "Example Bank", "country": params.get("country", "XX"), "bic": "EXMPXX00",
                                     "maximum_consent_validity": 15552000, "psu_types": ["personal", "business"]},
                                    {"name": "Other Mock Bank", "country": params.get("country", "XX"),
                                     "maximum_consent_validity": 7776000, "psu_types": ["personal"]}]}
        if path == "/auth":
            return 200, {"url": "https://auth.example.com/ais/start?sessionid=mock", "authorization_id": "mock-auth"}
        if path == "/sessions" and method == "POST":
            if body.get("code") == "expired":
                return 422, {"error": "EXPIRED_AUTHORIZATION_CODE", "message": "Authorization code is expired"}
            vu = (now() + dt.timedelta(days=180)).isoformat()
            return 200, {"session_id": "mock-session-0001", "access": {"valid_until": vu},
                         "aspsp": {"name": "Example Bank", "country": "XX"}, "psu_type": "personal",
                         "accounts": [{"uid": "acc-eur", "currency": "EUR", "cash_account_type": "CACC",
                                       "account_id": {"iban": "XX000000000000000001"}, "name": "Mock Holder"},
                                      {"uid": "acc-usd", "currency": "USD", "cash_account_type": "CACC",
                                       "account_id": {"iban": "XX000000000000000002"}, "name": "Mock Holder"}]}
        if path.startswith("/sessions/"):
            if os.environ.get("EB_MOCK_SESSION") == "revoked":
                return 200, {"status": "REVOKED", "access": {"valid_until": now().isoformat()}}
            return 200, {"status": "AUTHORIZED", "access": {"valid_until": (now() + dt.timedelta(days=170)).isoformat()}}
        m = re.match(r"^/accounts/([^/]+)/details$", path)
        if m:
            return 200, {"details": None if m.group(1) == "acc-eur" else "Mock savings", "cash_account_type": "CACC"}
        m = re.match(r"^/accounts/([^/]+)/(balances|transactions)$", path)
        if m:
            if os.environ.get("EB_MOCK_SESSION") == "expired":
                return 401, {"error": "EXPIRED_SESSION", "message": "Session is expired"}
            acc, what = m.groups()
            cur = "EUR" if acc == "acc-eur" else "USD"
            if what == "balances":
                return 200, {"balances": [{"name": "Available", "balance_type": "CLAV",
                                           "balance_amount": {"currency": cur, "amount": "1234.56"}}]}
            if cur == "USD":
                return 200, {"transactions": [self._tx(90, 40, 20.0, "USD", "DBIT", "4511")]}
            page = params.get("continuation_key")
            if not page:
                txs = [self._tx(1, 70, 2500.0, "EUR", "CRDT"), self._tx(2, 65, 45.10, "EUR", "DBIT", "5411"),
                       self._tx(3, 35, 18.00, "EUR", "DBIT", "5812"), self._tx(4, 34, 60.00, "EUR", "DBIT", "5541")]
                return 200, {"transactions": txs, "continuation_key": "p2"}
            txs = [self._tx(5, 3, 12.5, "EUR", "DBIT", "5814"), self._tx(6, 1, 9.99, "EUR", "DBIT", "5815", status="PDNG"),
                   self._tx(7, 2, 30.0, "EUR", "DBIT", None, tid=False)]
            if os.environ.get("EB_MOCK_EXTRA"):
                txs.append(self._tx(8, 0, 100.0, "EUR", "CRDT"))
                txs[1]["status"] = "BOOK"
            return 200, {"transactions": txs}
        return 404, {"error": "WRONG_REQUEST_PARAMETERS", "message": "mock: unknown %s %s" % (method, path)}


# ---------------------------------------------------------------- transactions

def tx_key(account, t):
    tid = t.get("transaction_id")
    if tid:
        return "id:" + tid
    raw = "|".join(str(x) for x in (account, t.get("entry_reference"), t.get("booking_date"), t.get("value_date"),
                                      (t.get("transaction_amount") or {}).get("amount"),
                                      t.get("credit_debit_indicator"), json.dumps(t.get("remittance_information"))))
    return "h:" + hashlib.sha256(raw.encode()).hexdigest()[:24]


def tx_row(account, t):
    amt = t.get("transaction_amount") or {}
    a = float(amt.get("amount") or 0)
    direction = t.get("credit_debit_indicator") or ("CRDT" if a >= 0 else "DBIT")
    signed = abs(a) if direction == "CRDT" else -abs(a)
    party = (t.get("creditor") if direction == "DBIT" else t.get("debtor")) or {}
    btc = t.get("bank_transaction_code") or {}
    bal = (t.get("balance_after_transaction") or {}).get("amount") or ""
    return {"key": tx_key(account, t), "transaction_id": t.get("transaction_id") or "",
            "entry_reference": t.get("entry_reference") or "", "account": account,
            "status": t.get("status") or "", "booking_date": t.get("booking_date") or "",
            "value_date": t.get("value_date") or "", "transaction_date": t.get("transaction_date") or "",
            "direction": direction, "amount": "%.2f" % signed, "currency": amt.get("currency") or "",
            "counterparty": party.get("name") or "", "description": " | ".join(t.get("remittance_information") or []),
            "mcc": t.get("merchant_category_code") or "", "bank_tx_code": btc.get("description") or btc.get("code") or "",
            "balance_after": bal}


def row_date(r):
    return r["booking_date"] or r["value_date"] or r["transaction_date"]


def fetch_transactions(api, uid, date_from=None, longest=False):
    params, out, pages = {}, [], 0
    if date_from:
        params["date_from"] = date_from
    if longest:
        params["strategy"] = "longest"
    while True:
        data = api.call("GET", "/accounts/%s/transactions" % uid, params=dict(params))
        out += data.get("transactions") or []
        pages += 1
        ck = data.get("continuation_key")
        if not ck or pages > 500:
            return out
        params["continuation_key"] = ck


def raw_dir(bank):
    return os.path.join(private_dir(bank), "raw")


def load_raw(bank):
    rows = {}
    d = raw_dir(bank)
    if not os.path.isdir(d):
        return rows
    for f in sorted(os.listdir(d)):
        if re.match(r"^transactions-\d{4}-\d{2}\.csv$", f):
            with open(os.path.join(d, f), encoding="utf8", newline="") as fh:
                for r in csv.DictReader(fh):
                    rows[r["key"]] = r
    return rows


def write_raw(bank, rows):
    by_month = {}
    for r in rows.values():
        by_month.setdefault((row_date(r) or "0000-00")[:7], []).append(r)
    for month, rs in sorted(by_month.items()):
        rs.sort(key=lambda r: (row_date(r), r["account"], r["key"]))
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=CSV_FIELDS, lineterminator="\n")
        w.writeheader()
        for r in rs:
            w.writerow({k: r.get(k, "") for k in CSV_FIELDS})
        write_file(os.path.join(raw_dir(bank), "transactions-%s.csv" % month), buf.getvalue())
    return by_month


def merge(rows, account, fetched, window_from=None):
    """Upsert fetched rows; inside the re-read window drop old pending rows of this account first."""
    if window_from:
        for k in [k for k, r in rows.items() if r["account"] == account and r["status"] != "BOOK"
                  and row_date(r) >= window_from]:
            del rows[k]
    added = 0
    for t in fetched:
        r = tx_row(account, t)
        if r["key"] not in rows:
            added += 1
        rows[r["key"]] = r
    return added


# ---------------------------------------------------------------- aggregates

MCC_GROUPS = [
    ("groceries", [(5411, 5411), (5422, 5422), (5441, 5451), (5462, 5462), (5499, 5499)]),
    ("restaurants & bars", [(5812, 5814)]),
    ("transport", [(4011, 4131), (4784, 4784), (7512, 7512), (7523, 7523), (4121, 4121)]),
    ("fuel", [(5541, 5542), (5983, 5983)]),
    ("travel & lodging", [(3000, 3999), (4411, 4411), (4511, 4511), (4722, 4722), (7011, 7011)]),
    ("shopping", [(5200, 5399), (5600, 5699), (5732, 5734), (5900, 5999), (5045, 5045)]),
    ("digital & subscriptions", [(4812, 4816), (4899, 4899), (5815, 5818), (7372, 7372)]),
    ("health", [(5912, 5912), (8011, 8099), (5975, 5976)]),
    ("utilities & services", [(4900, 4900), (7210, 7299), (7300, 7399), (8111, 8999)]),
    ("entertainment & sport", [(7832, 7999)]),
    ("cash", [(6010, 6011)]),
]


def category(r):
    mcc = (r.get("mcc") or "").strip()
    if not mcc.isdigit():
        return "transfers & other (no card category)"
    n = int(mcc)
    for name, ranges in MCC_GROUPS:
        if any(a <= n <= b for a, b in ranges):
            return name
    return "other card spending"


def aggregate(rows):
    months = {}
    for r in rows.values():
        month = (row_date(r) or "")[:7]
        if not re.match(r"^\d{4}-\d{2}$", month):
            continue
        cur = r["currency"] or "?"
        m = months.setdefault(month, {}).setdefault(cur, {"in": 0.0, "out": 0.0, "count": 0, "pending_count": 0,
                                                         "out_by_category": {}})
        if r["status"] != "BOOK":
            if r["status"] not in ("CNCL", "RJCT"):
                m["pending_count"] += 1
            continue
        a = float(r["amount"] or 0)
        m["count"] += 1
        if a >= 0:
            m["in"] += a
        else:
            m["out"] += -a
            c = category(r)
            m["out_by_category"][c] = m["out_by_category"].get(c, 0.0) + (-a)
    for month in months.values():
        for m in month.values():
            m["net"] = round(m["in"] - m["out"], 2)
            m["in"], m["out"] = round(m["in"], 2), round(m["out"], 2)
            top = sorted(m["out_by_category"].items(), key=lambda kv: -kv[1])[:5]
            m["out_by_category"] = {k: round(v, 2) for k, v in top}
    return dict(sorted(months.items()))


def money(x, cur):
    return "%s%s %s" % ("-" if x < 0 else "", "{:,.2f}".format(abs(x)), cur)


def bank_name(cfg, bank):
    return (cfg.get("aspsp") or {}).get("name") or bank


def write_totals(bank, cfg, rows, synced_at):
    months = aggregate(rows)
    name = bank_name(cfg, bank)
    data = {"generated": synced_at, "source": "%s via Enable Banking (tools/bank_sync.py)" % name,
            "note": "Booked movements only, per currency. Pending counted apart. Moves between your own accounts "
                    "count as in and out. Individual (sanitized) movements: transactions/.",
            "months": months}
    save_json(os.path.join(repo_dir(bank), "monthly-totals.json"), data, mode=0o644)
    lines = ["---", "name: %s monthly totals" % name, "type: finance", "updated: %s" % dt.date.today().isoformat(),
             "---", "", "# %s, monthly totals" % name, "",
             "<!-- GENERATED by tools/bank_sync.py: do not edit by hand, the next sync overwrites this file. -->", "",
             "Last sync %s UTC. Booked movements only; moves between your own accounts count on both sides. "
             "Single (sanitized) movements: `transactions/%s-YYYY-MM.md`." % (synced_at[:16].replace("T", " "), bank),
             "", "| Month | Currency | In | Out | Net | Movements | Pending |", "| --- | --- | ---: | ---: | ---: | ---: | ---: |"]
    for month in sorted(months, reverse=True):
        for cur, m in sorted(months[month].items()):
            lines.append("| %s | %s | %s | %s | %s | %d | %d |" % (month, cur, money(m["in"], cur), money(m["out"], cur),
                                                               money(m["net"], cur), m["count"], m["pending_count"]))
    lines += ["", "## Spending by category (top 5, from the card's merchant category code)", ""]
    for month in sorted(months, reverse=True):
        for cur, m in sorted(months[month].items()):
            if m["out_by_category"]:
                lines.append("- %s %s: %s" % (month, cur, "; ".join("%s %s" % (k, money(v, cur))
                                                                    for k, v in m["out_by_category"].items())))
    lines += ["", "Related: [[_me]], [[finance/banks/README]]", ""]
    write_file(os.path.join(repo_dir(bank), "monthly-totals.md"), "\n".join(lines), mode=0o644)
    return months


def export_rows(rows):
    """Raw private rows -> bank_export rows. Bank ids (key, transaction_id, entry_reference) and balances are
    never passed on; the sanitizer masks card numbers, IBANs and references inside the free text."""
    out = []
    for r in rows.values():
        out.append({"date": row_date(r), "amount": r.get("amount"), "currency": r.get("currency"),
                    "counterparty": r.get("counterparty"), "description": r.get("description"),
                    "category": category(r) if (r.get("mcc") or "").strip().isdigit() else "",
                    "type": r.get("bank_tx_code"), "status": r.get("status"), "account": r.get("account")})
    return out


def sub_names(cfg):
    return {a["label"]: a.get("name") for a in cfg.get("accounts", [])}


def write_transactions(bank, cfg, rows):
    def wf(path, text):
        write_file(path, text, mode=0o644)
    return bank_export.write_months(export_rows(rows), os.path.join(repo_dir(bank), "transactions"), bank_name(cfg, bank),
                                    bank, wf, accounts=sub_names(cfg), tool="tools/bank_sync.py",
                                    links=("_me", "finance/banks/README"))


def write_account_card(bank, cfg, rows, counts, synced_at):
    n_by_acc = {}
    for r in rows.values():
        n_by_acc[r["account"]] = n_by_acc.get(r["account"], 0) + 1
    vu = cfg.get("session_valid_until") or "UNKNOWN"
    asp = cfg.get("aspsp") or {}
    lines = ["---", "name: %s accounts" % bank_name(cfg, bank), "type: finance",
             "updated: %s" % dt.date.today().isoformat(), "---", "",
             "# %s accounts" % bank_name(cfg, bank), "",
             "<!-- GENERATED by tools/bank_sync.py: do not edit by hand, the next sync overwrites this file. -->", "",
             "- Bank: %s (country %s), %s account(s)." % (asp.get("name") or "UNKNOWN", asp.get("country") or "UNKNOWN",
                                                         cfg.get("psu_type") or "personal"),
             "- Access: read-only PSD2 account information through Enable Banking: balances and transactions only, "
             "no payments possible.",
             "- Consent valid until **%s UTC**. Renew: `python3 tools/bank_sync.py auth --bank %s --aspsp ... --country ...` "
             "(you approve in the bank's app); `status` exits 5 from %d days before." % (vu.replace("T", " ")[:19], bank, WARN_DAYS),
             "- Sync: `python3 tools/bank_sync.py sync --bank %s` (about once a day; banks allow ~4 unattended reads a "
             "day). Last sync: %s UTC; %d month file(s) in `transactions/`." % (bank, synced_at.replace("T", " ")[:16], len(counts)),
             "", "Labels are masked: currency + last 4 of the IBAN or of the bank's account id. Sub-account names "
             "come from the bank's account details, when it gives them.", "",
             "| Label | Type | Name | Currency | Transactions in repo |", "| --- | --- | --- | --- | ---: |"]
    for a in cfg.get("accounts", []):
        kind = {"CACC": "current", "SVGS": "savings", "CARD": "card"}.get(a.get("type"), a.get("type") or "UNKNOWN")
        lines.append("| %s | %s | %s | %s | %d |" % (a["label"], kind, bank_export.sanitize(a.get("name")) or "UNKNOWN",
                                                    a.get("currency") or "UNKNOWN", n_by_acc.get(a["label"], 0)))
    lines += ["", "Monthly totals: `monthly-totals.md`. Months: %s." % (
        ", ".join("[[%s-%s]]" % (bank, m) for m in sorted(counts, reverse=True)) or "none"),
        "", "Related: [[_me]], [[finance/banks/README]]", ""]
    write_file(os.path.join(repo_dir(bank), "accounts.md"), "\n".join(lines), mode=0o644)


def write_repo(bank, cfg, rows, synced_at):
    if not inside_repo(REPO_DIR) and not os.environ.get("EB_REPO_DIR"):
        raise Fail(1, "repo folder %s is not inside the repo" % REPO_DIR)
    months = write_totals(bank, cfg, rows, synced_at)
    counts = write_transactions(bank, cfg, rows)
    write_account_card(bank, cfg, rows, counts, synced_at)
    return months, counts


def fetch_names(cfg, api):
    """Best effort: sub-account names from GET /accounts/{uid}/details. A current account with none -> 'main'."""
    for a in cfg.get("accounts", []):
        if a.get("name"):
            continue
        try:
            d = api.call("GET", "/accounts/%s/details" % a["uid"])
        except Fail:
            continue
        a["name"] = d.get("details") or d.get("product") or ("main" if a.get("type") == "CACC" else None)


# ---------------------------------------------------------------- state / status

def state_path(bank):
    return os.path.join(private_dir(bank), "state.json")


def days_left(valid_until):
    if not valid_until:
        return None
    try:
        t = dt.datetime.fromisoformat(valid_until.replace("Z", "+00:00"))
    except ValueError:
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=dt.timezone.utc)
    return (t - now()).total_seconds() / 86400


def renew_msg(bank, left):
    how = "python3 tools/bank_sync.py auth --bank %s --aspsp '<bank name>' --country <CC>" % bank
    if left is None:
        return "RENEW NEEDED (%s): no active session. Run  %s" % (bank, how)
    if left <= 0:
        return "RENEW NEEDED (%s): consent expired %d day(s) ago. Run  %s" % (bank, max(0, -int(left)), how)
    return "RENEW NEEDED (%s) in %d day(s): run  %s" % (bank, int(left), how)


def cmd_status(args):
    app = load_app()
    banks = [check_slug(args.bank)] if args.bank else known_banks()
    print("app_id:        %s" % ("set" if app.get("app_id") else "NOT SET"))
    print("private key:   %s" % ("present" if os.path.exists(os.path.join(SECRETS, "private.key")) else "MISSING"))
    if not app.get("app_id"):
        print("not configured: docs/setup/bank-enable-banking.md, then  python3 tools/bank_sync.py setup --app-id <uuid>")
        return 2
    if not banks:
        print("no bank linked yet:  python3 tools/bank_sync.py auth --bank <slug> --aspsp '<bank name>' --country <CC>")
        return 2
    worst = 0
    for bank in banks:
        cfg, st = load_bank(bank), load_json(state_path(bank), {})
        left = days_left(cfg.get("session_valid_until"))
        asp = cfg.get("aspsp") or {}
        print("\n[%s]" % bank)
        print("  bank:        %s" % ("%s/%s" % (asp.get("name"), asp.get("country")) if asp else "-"))
        print("  session:     %s" % ("active" if cfg.get("session_id") else "none"))
        print("  valid until: %s%s" % (cfg.get("session_valid_until") or "-",
                                       "" if left is None else "  (%.1f days left)" % left))
        print("  accounts:    %s" % (", ".join(a["label"] for a in cfg.get("accounts", [])) or "-"))
        print("  last sync:   %s (%s)" % (st.get("last_sync") or "never", st.get("last_result") or "-"))
        print("  raw rows:    %s   months: %s" % (st.get("rows", 0), st.get("months", 0)))
        code = 0
        if left is None or left <= 0:
            print("  " + renew_msg(bank, left))
            code = 3
        elif left <= WARN_DAYS:
            print("  " + renew_msg(bank, left))
            code = 5
        worst = 3 if 3 in (worst, code) else max(worst, code)
    return worst


# ---------------------------------------------------------------- commands

def cmd_setup(args):
    if not args.app_id:
        raise Fail(1, "setup needs --app-id <uuid> (the id Enable Banking gave your application)")
    try:
        v = str(uuid.UUID(args.app_id.strip()))
    except ValueError:
        raise Fail(1, "app id must be a UUID like aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    app = load_app()
    app["app_id"] = v
    if args.redirect_url:
        app["redirect_url"] = args.redirect_url
    app.setdefault("redirect_url", DEFAULT_REDIRECT)
    if args.key:
        src = os.path.expanduser(args.key)
        if not os.path.exists(src):
            raise Fail(1, "key file %s not found" % src)
        with open(src, encoding="utf8") as fh:
            key = fh.read()
        if "PRIVATE KEY" not in key:
            raise Fail(1, "%s does not look like a PEM private key" % src)
        if inside_repo(SECRETS):
            raise Fail(1, "secrets folder %s is inside the repo: refusing" % SECRETS)
        secure_dir(SECRETS)
        write_file(os.path.join(SECRETS, "private.key"), key)
        print("private key copied to %s (600). You may delete the downloaded copy." % os.path.join(SECRETS, "private.key"))
    if not args.no_verify:
        info = Api(app, args.mock).call("GET", "/application")
        print("app: %s | environment %s | active %s | redirect URLs %s" % (
            info.get("name"), info.get("environment"), info.get("active"), ", ".join(info.get("redirect_urls") or [])))
        if app["redirect_url"] not in (info.get("redirect_urls") or []):
            print("WARNING: %s is not among the app's redirect URLs; pass --redirect-url <one of them>" % app["redirect_url"])
        if not info.get("active"):
            print("NOTE: app not active yet: in the Control Panel, activate it by linking your own accounts "
                  "(restricted production), then run status again")
    save_app(app)
    print("app settings saved in %s" % app_path())
    return 0


def cmd_banks(args, api):
    if not args.country:
        raise Fail(1, "banks needs --country <two-letter code>, e.g. --country IT")
    data = api.call("GET", "/aspsps", params={"country": args.country.upper(), "psu_type": args.psu_type, "service": "AIS"})
    names = [a for a in data.get("aspsps") or [] if not args.find or args.find.lower() in (a.get("name") or "").lower()]
    for a in sorted(names, key=lambda a: a.get("name") or ""):
        days = int(a.get("maximum_consent_validity") or 0) // 86400
        print("%-40s %s  consent max %s day(s)" % (a.get("name"), a.get("country"), days or "?"))
    print("%d bank(s)." % len(names))
    return 0


def pick_aspsp(api, name, country, psu_type):
    data = api.call("GET", "/aspsps", params={"country": country.upper(), "psu_type": psu_type, "service": "AIS"})
    found = data.get("aspsps") or []
    for a in found:
        if (a.get("name") or "").strip().lower() == name.strip().lower():
            return a
    close = [a.get("name") for a in found if name.strip().lower()[:4] in (a.get("name") or "").lower()][:8]
    raise Fail(1, "'%s' not found among the %s banks%s. List them:  python3 tools/bank_sync.py banks --country %s"
               % (name, country.upper(), (" (close: %s)" % ", ".join(close)) if close else "", country.upper()))


def cmd_auth_start(args, app, api):
    bank = check_slug(args.bank)
    if not (args.aspsp and args.country):
        raise Fail(1, "auth needs --aspsp '<bank name as in `banks`>' and --country <CC> (or --code to finish)")
    a = pick_aspsp(api, args.aspsp, args.country, args.psu_type)
    max_s = int(a.get("maximum_consent_validity") or MAX_DAYS * 86400)
    secs = min(max_s, min(args.days, MAX_DAYS) * 86400) - 600
    vu = (now() + dt.timedelta(seconds=secs)).replace(microsecond=0).isoformat()
    state = str(uuid.uuid4())
    redirect = args.redirect_url or app.get("redirect_url") or DEFAULT_REDIRECT
    body = {"access": {"valid_until": vu, "balances": True, "transactions": True},
            "aspsp": {"name": a["name"], "country": a["country"]}, "state": state,
            "redirect_url": redirect, "psu_type": args.psu_type}
    lang = str(config.get("owner_language", "", example=False) or "")
    if re.match(r"^[a-z]{2}$", lang):
        body["language"] = lang
    data = api.call("POST", "/auth", body=body)
    cfg = load_bank(bank)
    cfg["pending_auth"] = {"state": state, "created": now().isoformat(), "valid_until": vu,
                           "aspsp": {"name": a["name"], "country": a["country"]}, "redirect_url": redirect}
    cfg["psu_type"] = args.psu_type
    save_bank(bank, cfg)
    print("Bank: %s (%s), consent until %s (%d days)." % (a["name"], a["country"], vu, secs // 86400))
    print("Open this link and approve in your bank's app (select EVERY account you want read):")
    print(data["url"])
    print("Your browser then lands on %s?code=... (the page may not load: that is fine)." % redirect)
    print("Copy that full address and run:")
    print("  python3 tools/bank_sync.py auth --bank %s --code '<that address>'" % bank)
    return 0


def parse_code(s):
    s = s.strip()
    if "://" in s or s.startswith("?") or "code=" in s:
        q = parse_qs(urlparse(s).query if "://" in s else s.split("?", 1)[-1])
        if "error" in q:
            raise Fail(1, "bank/consent returned error: %s %s" % (q["error"][0], (q.get("error_description") or [""])[0]))
        if "code" not in q:
            raise Fail(1, "no code= in the pasted address")
        return q["code"][0], (q.get("state") or [None])[0]
    return s, None


def label_for(acc, used):
    cur = acc.get("currency") or "XXX"
    aid = acc.get("account_id") or {}
    ident = aid.get("iban") or (aid.get("other") or {}).get("identification") or acc.get("uid", "")
    ident = re.sub(r"[^A-Za-z0-9]", "", ident)
    base = "%s-%s" % (cur, ident[-4:] if ident else "x")
    lab, n = base, 2
    while lab in used:
        lab, n = "%s-%d" % (base, n), n + 1
    used.add(lab)
    return lab


def cmd_auth_code(args, app, api):
    bank = check_slug(args.bank)
    cfg = load_bank(bank)
    code, state = parse_code(args.code)
    pend = cfg.get("pending_auth") or {}
    if state and pend.get("state") and state != pend["state"]:
        raise Fail(1, "state mismatch: this code belongs to another auth start; run  auth  again")
    data = api.call("POST", "/sessions", body={"code": code})
    used, accounts = set(), []
    old = {a["uid"]: a for a in cfg.get("accounts", [])}
    for acc in data.get("accounts") or []:
        if not acc.get("uid"):
            continue
        prev = old.get(acc["uid"], {})
        accounts.append({"uid": acc["uid"], "currency": acc.get("currency"), "type": acc.get("cash_account_type"),
                         "label": prev.get("label") or label_for(acc, used), "name": prev.get("name")})
        used.add(accounts[-1]["label"])
    if not accounts:
        raise Fail(1, "session created but NO accounts returned. In restricted production only the accounts you "
                      "linked in the Control Panel are visible: link them there, then auth again.")
    cfg.update({"session_id": data["session_id"], "session_valid_until": (data.get("access") or {}).get("valid_until"),
                "aspsp": data.get("aspsp") or pend.get("aspsp"), "accounts": accounts,
                "session_created": now().isoformat()})
    cfg.pop("pending_auth", None)
    fetch_names(cfg, api)
    save_bank(bank, cfg)
    left = days_left(cfg["session_valid_until"])
    print("Session stored (%s), %d account(s): %s. Valid until %s (%.0f days)." % (
        short(cfg["session_id"]), len(accounts), ", ".join(a["label"] for a in accounts),
        cfg["session_valid_until"], left or 0))
    print("Pulling the full history now (some banks give more than 90 days only right after the consent)...")
    return do_sync(bank, cfg, api, full=True)


def do_sync(bank, cfg, api, full=False):
    ensure_private(bank)
    if not cfg.get("session_id"):
        print(renew_msg(bank, None))
        return 3
    left = days_left(cfg.get("session_valid_until"))
    if left is not None and left <= 0:
        print(renew_msg(bank, left))
        return 3
    st = load_json(state_path(bank), {})
    sess = api.call("GET", "/sessions/%s" % cfg["session_id"])
    if sess.get("status") not in (None, "AUTHORIZED"):
        print("RENEW NEEDED (%s): session status %s at the bank. %s" % (bank, sess.get("status"), renew_msg(bank, None)))
        st.update({"last_result": "RENEW NEEDED (%s)" % sess.get("status"), "last_attempt": now().isoformat()})
        save_json(state_path(bank), st)
        return 3
    vu = (sess.get("access") or {}).get("valid_until")
    if vu and vu != cfg.get("session_valid_until"):
        cfg["session_valid_until"] = vu
        save_bank(bank, cfg)
    rows = load_raw(bank)
    balances, summary = {}, []
    last_seen = st.get("last_seen", {})
    for acc in cfg.get("accounts", []):
        uid, label = acc["uid"], acc["label"]
        b = api.call("GET", "/accounts/%s/balances" % uid)
        balances[label] = [{"type": x.get("balance_type"), "name": x.get("name"),
                            "amount": (x.get("balance_amount") or {}).get("amount"),
                            "currency": (x.get("balance_amount") or {}).get("currency"),
                            "reference_date": x.get("reference_date")} for x in b.get("balances") or []]
        if full or label not in last_seen:
            fetched, window = fetch_transactions(api, uid, longest=True), None
        else:
            window = (dt.date.fromisoformat(last_seen[label]) - dt.timedelta(days=OVERLAP_DAYS)).isoformat()
            fetched = fetch_transactions(api, uid, date_from=window)
        added = merge(rows, label, fetched, window)
        dates = [row_date(r) for r in rows.values() if r["account"] == label and r["status"] == "BOOK" and row_date(r)]
        if dates:
            last_seen[label] = max(dates)
        summary.append("%s +%d new (%d read)" % (label, added, len(fetched)))
    synced = now().replace(microsecond=0).isoformat()
    by_month = write_raw(bank, rows)
    save_json(os.path.join(private_dir(bank), "balances.json"), {"as_of": synced, "accounts": balances})
    months, counts = write_repo(bank, cfg, rows, synced)
    left = days_left(cfg.get("session_valid_until"))
    st.update({"last_sync": synced, "last_result": "ok", "last_seen": last_seen, "rows": len(rows),
               "months": len(by_month), "session_valid_until": cfg.get("session_valid_until"),
               "session_days_left": None if left is None else round(left, 1)})
    save_json(state_path(bank), st)
    print("sync ok [%s]: %s. %d rows in %d month file(s); totals for %d month(s) and %d sanitized month file(s) "
          "written to %s" % (bank, "; ".join(summary), len(rows), len(by_month), len(months), len(counts),
                             os.path.relpath(repo_dir(bank), ROOT)))
    if left is not None and left <= WARN_DAYS:
        print(renew_msg(bank, left))
    return 0


def cmd_sync(args, app, api):
    banks = [check_slug(args.bank)] if args.bank else [b for b in known_banks() if load_bank(b).get("session_id")]
    if not banks:
        print("no bank linked yet:  python3 tools/bank_sync.py auth --bank <slug> --aspsp '<bank name>' --country <CC>")
        return 2
    worst = 0
    for bank in banks:
        try:
            code = do_sync(bank, load_bank(bank), api)
        except Fail as e:
            print("bank_sync [%s]: %s" % (bank, e), file=sys.stderr)
            code = e.code
        worst = max(worst, code) if worst != 3 else 3
    return worst


def cmd_export(args):
    banks = [check_slug(args.bank)] if args.bank else known_banks()
    for bank in banks:
        rows, cfg = load_raw(bank), load_bank(bank)
        synced = now().replace(microsecond=0).isoformat()
        months, counts = write_repo(bank, cfg, rows, synced)
        print("[%s] rebuilt from %d raw rows: %d month(s); %d sanitized month file(s), %d rows" % (
            bank, len(rows), len(months), len(counts), sum(counts.values())))
    if not banks:
        print("no bank linked yet: nothing to export")
    return 0


def main(argv=None):
    global DRY
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("mode", nargs="?", choices=["setup", "banks", "auth", "sync", "status", "export", "totals"])
    p.add_argument("--bank", help="your short slug for the bank (folder name), e.g. mybank")
    p.add_argument("--aspsp", help="auth: the bank's name exactly as `banks` lists it")
    p.add_argument("--country", help="two-letter country code of the bank (banks, auth)")
    p.add_argument("--psu-type", default="personal", choices=["personal", "business"])
    p.add_argument("--days", type=int, default=MAX_DAYS, help="auth: consent length in days (max 180, the bank may cap it)")
    p.add_argument("--find", help="banks: filter by part of the name")
    p.add_argument("--code", help="auth: the redirected URL (or just the code)")
    p.add_argument("--app-id", metavar="UUID", help="setup: your Enable Banking application id")
    p.add_argument("--key", help="setup: the private key .pem to copy into the secrets folder")
    p.add_argument("--redirect-url", help="the redirect URL (must be registered on the app)")
    p.add_argument("--no-verify", action="store_true", help="setup: skip GET /application")
    p.add_argument("--mock", action="store_true", help="fake API responses, no network")
    p.add_argument("--dry-run", action="store_true", help="write nothing")
    a = p.parse_args(argv)
    DRY = a.dry_run
    try:
        if a.mode == "setup":
            return cmd_setup(a)
        if a.mode == "status":
            return cmd_status(a)
        if a.mode in ("totals", "export"):
            return cmd_export(a)
        app = load_app()
        api = Api(app, a.mock)
        if a.mode == "banks":
            return cmd_banks(a, api)
        if a.mode == "auth":
            return cmd_auth_code(a, app, api) if a.code else cmd_auth_start(a, app, api)
        if a.mode == "sync":
            return cmd_sync(a, app, api)
        p.print_help()
        return 1
    except Fail as e:
        print("bank_sync: %s%s" % ("" if e.code == 3 else "ERROR ", e), file=sys.stderr)
        if e.code == 3 and a.bank:
            print(renew_msg(a.bank, None), file=sys.stderr)
        return e.code


if __name__ == "__main__":
    sys.exit(main())
