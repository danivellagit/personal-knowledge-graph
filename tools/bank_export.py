#!/usr/bin/env python3
"""Sanitized bank transaction export: one markdown table per month, safe to commit to a PRIVATE repo.

Generic helper used by a bank sync tool (e.g. a PSD2/open-banking read-only sync). The raw movements stay in a
private folder outside the repo; this module turns them into `data/finance/banks/<bank>/transactions/<bank>-YYYY-MM.md`
with one row per transaction and NOTHING that identifies an instrument or a bank record:

  - card numbers (13-19 digits, spaces/dashes allowed) are masked to `****1234` (last 4 only)
  - IBANs (checksum-valid or IBAN-shaped) are masked to `IBAN ****1234` (last 4 only)
  - bank reference / transaction ids are dropped: the raw id columns are never read, and UUIDs, `MB:`/`REF:`
    style references and long digit-heavy tokens inside descriptions become `[ref]`
  - `|` and newlines are escaped so a description cannot break the table

Rows passed in are plain dicts:
    {"date": "YYYY-MM-DD", "amount": "-12.50", "currency": "EUR", "counterparty": "...", "description": "...",
     "category": "groceries" or "", "type": "CARD_PAYMENT" or "", "status": "BOOK"|"PDNG"|..., "account": "EUR-1234"}
`account` must already be a masked label (currency + last 4), never a full account number.

    python3 tools/bank_export.py --selftest      # quick check of the sanitizer
The precommit guard (tools/precommit.py) re-checks every staged file for full IBANs and card numbers.
"""

import os
import re
import sys

# ---------------------------------------------------------------- detectors (shared with tools/precommit.py)

IBAN_RX = re.compile(r"\b([A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30})\b")
CARD_RX = re.compile(r"(?<![\d*])(\d(?:[ -]?\d){12,18})(?!\d)")
UUID_RX = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
REF_PREFIX_RX = re.compile(r"\b(MB|REF|RIF|TRN|CRO|TXN|ID)[:#]\s*[A-Za-z0-9-]{4,}", re.I)
LONG_TOKEN_RX = re.compile(r"\b(?=[A-Za-z0-9-]*\d[A-Za-z0-9-]*\d[A-Za-z0-9-]*\d[A-Za-z0-9-]*\d[A-Za-z0-9-]*\d[A-Za-z0-9-]*\d)"
                           r"[A-Za-z0-9-]{10,}\b")


def luhn_ok(digits):
    s, alt = 0, False
    for ch in reversed(digits):
        d = int(ch)
        if alt:
            d *= 2
            if d > 9:
                d -= 9
        s += d
        alt = not alt
    return s % 10 == 0


def iban_ok(compact):
    """ISO 13616 mod-97 check on an IBAN without spaces."""
    if not re.match(r"^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$", compact):
        return False
    moved = compact[4:] + compact[:4]
    num = "".join(str(int(c, 36)) for c in moved)
    return int(num) % 97 == 1


def find_ibans(text, examples=False):
    """Checksum-valid IBANs in text (compact form). Used by the precommit guard: near-zero false positives.
    examples=False skips the published example IBANs (EXAMPLES)."""
    out = []
    for m in IBAN_RX.finditer(text or ""):
        c = re.sub(r"[ -]", "", m.group(1))
        # an IBAN followed by more text may have swallowed a trailing word: try every length from long to short
        for n in range(len(c), 14, -1):
            if iban_ok(c[:n]):
                if examples or c[:n] not in EXAMPLES:
                    out.append(c[:n])
                break
    return out


# published test values (ISO/bank documentation examples): allowed in code and tests, still masked in exports
EXAMPLES = {"IT60X0542811101000000123456", "GB82WEST12345698765432", "DE89370400440532013000",
            "4111111111111111", "5555555555554444", "378282246310005", "4012888888881881"}


def card_brand_ok(d):
    """Issuer prefix + length of the major card schemes, so ids that only happen to pass Luhn
    (chat ids, phone-like numbers) are not reported."""
    n = len(d)
    p2, p4 = int(d[:2]), int(d[:4])
    return ((d[0] == "4" and n in (13, 16, 19)) or (51 <= p2 <= 55 and n == 16) or (2221 <= p4 <= 2720 and n == 16)
            or (p2 in (34, 37) and n == 15) or ((d.startswith("6011") or p2 == 65 or 644 <= int(d[:3]) <= 649) and 16 <= n <= 19)
            or (3528 <= p4 <= 3589 and 16 <= n <= 19) or ((p2 in (36, 38, 39) or 300 <= int(d[:3]) <= 305) and n == 14)
            or ((p2 == 50 or 56 <= p2 <= 69) and 13 <= n <= 19 and d[:4] != "6011"))


def find_cards(text, examples=False):
    """Luhn-valid 13-19 digit runs (spaces/dashes allowed) with a card scheme prefix. examples=False skips
    the published test numbers (EXAMPLES)."""
    out = []
    for m in CARD_RX.finditer(text or ""):
        d = re.sub(r"[ -]", "", m.group(1))
        if 13 <= len(d) <= 19 and len(set(d)) > 1 and luhn_ok(d) and card_brand_ok(d):
            if examples or d not in EXAMPLES:
                out.append(d)
    return out


# ---------------------------------------------------------------- sanitizer

def _mask_iban(m):
    c = re.sub(r"[ -]", "", m.group(1))
    return "IBAN ****" + c[-4:]


def _mask_card(m):
    d = re.sub(r"[ -]", "", m.group(1))
    if 13 <= len(d) <= 19:
        return "****" + d[-4:]
    return m.group(0)


def _mask_token(m):
    t = m.group(0)
    if re.match(r"^\d{4}-\d{2}-\d{2}$|^\d{2}-\d{2}-\d{4}$", t):   # a date is not a reference
        return t
    return "[ref]"


def sanitize(text):
    """Strip instrument numbers and bank references from free text (description, counterparty)."""
    s = " ".join(str(text or "").split())            # newlines/tabs -> single spaces
    s = IBAN_RX.sub(_mask_iban, s)                     # IBAN-shaped, checksum or not: keep last 4
    s = CARD_RX.sub(_mask_card, s)                     # any 13-19 digit run: keep last 4 (Luhn or not)
    s = UUID_RX.sub("[ref]", s)
    s = REF_PREFIX_RX.sub(lambda m: m.group(1) + ":[ref]", s)
    s = LONG_TOKEN_RX.sub(_mask_token, s)
    s = re.sub(r"(\[ref\]\s*){2,}", "[ref] ", s).strip()
    return s.replace("\\", "/").replace("|", "\\|")


def label_ok(label):
    """Account labels are masked: CUR-xxxx (4 trailing chars) with an optional -N suffix."""
    return bool(re.match(r"^[A-Z]{3}-[A-Za-z0-9]{1,4}(-\d+)?$", label or ""))


# ---------------------------------------------------------------- markdown

HEADER = ("| Date | Amount | Currency | Counterparty / description | Category | Type | Account | Status |\n"
          "| --- | ---: | --- | --- | --- | --- | --- | --- |")
STATUS = {"BOOK": "booked", "PDNG": "pending", "CNCL": "cancelled", "RJCT": "rejected", "INFO": "info"}


def text_of(r):
    cp, desc = sanitize(r.get("counterparty")), sanitize(r.get("description"))
    if cp and desc and cp.lower() not in desc.lower():
        return "%s · %s" % (cp, desc)
    return desc or cp or "UNKNOWN"


def row_line(r):
    if not label_ok(r.get("account")):
        raise ValueError("account label is not masked (CUR-xxxx expected)")
    return "| %s | %s | %s | %s | %s | %s | %s | %s |" % (
        r.get("date") or "UNKNOWN", r.get("amount") or "UNKNOWN", r.get("currency") or "UNKNOWN", text_of(r),
        sanitize(r.get("category")) or "UNKNOWN", sanitize(r.get("type")) or "UNKNOWN", r["account"],
        STATUS.get(r.get("status") or "", (r.get("status") or "UNKNOWN").lower()))


def month_markdown(bank, slug, month, rows, accounts=None, generated=None, tool="the bank sync tool",
                   links=("_me",)):
    """One month file. `accounts` maps label -> pocket/sub-account name (or None)."""
    rows = sorted(rows, key=lambda r: (r.get("date") or "", r.get("account") or "", r.get("amount") or ""))
    used = sorted({r["account"] for r in rows})
    lines = ["---", "name: %s transactions %s" % (bank, month), "type: finance", "month: %s" % month,
             "rows: %d" % len(rows), "---", "", "# %s transactions, %s" % (bank, month), "",
             "<!-- GENERATED by %s: do not edit by hand, the next sync overwrites this file. -->" % tool, "",
             "Sanitized export: no card numbers, IBANs only as last 4, no bank reference or transaction ids. "
             "Amounts are signed (negative = money out). Moves between own accounts/pockets appear on both sides."
             + (" Generated %s." % generated if generated else ""), "", HEADER]
    lines += [row_line(r) for r in rows]
    if accounts:
        lines += ["", "Accounts: " + "; ".join("%s = %s" % (a, accounts.get(a) or "UNKNOWN") for a in used)]
    lines += ["", "Related: " + ", ".join("[[%s]]" % l for l in links), ""]
    return "\n".join(lines)


def by_month(rows):
    out = {}
    for r in rows:
        m = (r.get("date") or "")[:7]
        if re.match(r"^\d{4}-\d{2}$", m):
            out.setdefault(m, []).append(r)
    return dict(sorted(out.items()))


def write_months(rows, out_dir, bank, slug, write_file, **kw):
    """Write (overwrite) one file per month; returns {month: row count}. Idempotent for the same input."""
    counts = {}
    for month, rs in by_month(rows).items():
        text = month_markdown(bank, slug, month, rs, **kw)
        leaks = find_ibans(text, True) + find_cards(text, True)
        if leaks:
            raise ValueError("sanitizer left %d instrument number(s) in %s %s: refusing to write" % (len(leaks), slug, month))
        write_file(os.path.join(out_dir, "%s-%s.md" % (slug, month)), text)
        counts[month] = len(rs)
    return counts


def _selftest():
    s = sanitize("Pay IT60 X054 2811 1010 0000 0123 456 card 4111 1111 1111 1111 To EUR MB:3f2a9c1e-1b2c-4d5e-8f90-1a2b3c4d5e6f")
    assert "0123456" not in s and "****3456" in s, s
    assert "4111 1111" not in s and "****1111" in s, s
    assert "3f2a9c1e" not in s and "[ref]" in s, s
    assert sanitize("paid 2026-11-03") == "paid 2026-11-03"
    assert find_ibans("IT60X0542811101000000123456", True) and not find_ibans("IT60X0542811101000000123457", True)
    assert find_cards("4111111111111111", True) and not find_cards("4111111111111112", True)
    assert not find_ibans("IT60X0542811101000000123456") and not find_cards("4111111111111111")
    print("bank_export selftest ok")
    return 0


if __name__ == "__main__":
    sys.exit(_selftest() if "--selftest" in sys.argv else (print(__doc__) or 0))
