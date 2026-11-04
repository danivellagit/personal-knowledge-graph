# Connect a bank, read-only (Enable Banking, PSD2)

**Optional.** About 30-45 minutes the first time (most of it is the Enable Banking sign-up and the bank's
consent screens), then about 2 minutes every renewal (at most every 180 days; some banks ask sooner).

Your bank's transactions in the graph, so the accountant agent can answer "how much did I spend on X" and the
Life App can show your finances. It works with most EU / EEA banks and neobanks that Enable Banking lists. It
is **read-only**: the tool only uses PSD2 *account information* (balances and transactions). It cannot pay, move
money or change anything at the bank.

What goes where:

| What | Where | In git? |
| --- | --- | --- |
| The app's private key, app id, bank sessions | `~/.secrets/enablebanking/` (folder 700, files 600) | never |
| Raw movements (with bank ids, full account numbers), balances, sync state | `~/private/finance/<bank>/` (700) | never |
| Sanitized month files, monthly totals, the account card | `data/finance/banks/<bank>/` | only if your copy is a PRIVATE repo (`data/` is gitignored by default) |

Sanitized means (`tools/bank_export.py`, re-checked by `tools/precommit.py` on every commit): no card numbers
(`****1234`), IBANs only as their last 4 characters, no bank reference or transaction ids, no balances. Account
labels are `CUR-1234` (currency + last 4). Both folders above can be moved: `banks.secrets_dir` and
`banks.private_dir` in `config.local.yml` (or `EB_SECRETS_DIR` / `EB_PRIVATE_DIR`); the tool refuses a private or
secrets folder inside the repo.

## 1. Register your own Enable Banking application (once)

Enable Banking is a licensed aggregator that talks PSD2 to the banks for you. You register **your own**
application, so your data goes from the bank to your machine only. (Check their current terms and pricing on
their site before you start; this repo does not know them.)

1. Go to <https://enablebanking.com/sign-in/> and enter your email. The account is created on the first sign-in;
   open the one-time link they email you. You land in the **Control Panel**.
2. Top menu **API applications** > **Add a new application**:
   - **Environment:** *Production*. Used on your own accounts only, it runs in *restricted* mode: only the
     accounts you link yourself are visible (step 4). *Sandbox* is fake banks, fine for a first try.
   - **Private key:** keep the default ("generated in the browser"). On **Register** your browser downloads the
     key as `<application id>.pem`. That file name **is** your application id (a UUID).
   - **Name:** anything neutral, e.g. `my-bank-sync`. Your bank shows it on the consent screen.
   - **Redirect URLs:** add `https://localhost/bank-callback`. After you approve at the bank, your browser is
     sent there with `?code=...` in the address. Nothing has to run at that address: the page failing to load is
     expected, you only copy the address.
   - Services: account information (AIS). You need no payment services.
3. Install the two Python packages the tool needs: `pip install requests pyjwt cryptography`.
4. **Activate the application by linking your accounts.** In restricted production the Control Panel asks you to
   link the accounts the app may read ("activate by linking accounts"): pick your bank, log in, approve. Accounts
   you do not link there stay invisible to the app later.
5. Give the tool the id and the key (the key is copied into the secrets folder; delete the download afterwards):

   ```bash
   python3 tools/bank_sync.py setup --app-id <the uuid from the file name> --key ~/Downloads/<uuid>.pem
   ```

   It calls `GET /application` and prints the app's name, environment, whether it is active and its redirect
   URLs. A different redirect URL? Add `--redirect-url <the one you registered>`.

## 2. Link a bank (once per bank, and at every renewal)

Pick a short slug for the bank (the folder name): `mybank`, `savings-bank`...

```bash
python3 tools/bank_sync.py banks --country IT --find "my bank"    # the exact name Enable Banking uses
python3 tools/bank_sync.py auth --bank mybank --aspsp "My Bank" --country IT
```

`auth` prints a link. Open it, approve in your bank's app or website, and select **every** account (and currency
or sub-account) you want read. Your browser lands on `https://localhost/bank-callback?code=...&state=...`. Copy
the whole address, then:

```bash
python3 tools/bank_sync.py auth --bank mybank --code 'https://localhost/bank-callback?code=...&state=...'
```

It stores the session, labels the accounts (`EUR-1234`), and pulls the **full history right away**: some banks
give more than 90 days of history only in the first minutes after a consent.

A bank that operates across the EU from one licence (many neobanks do) may be listed under the country of that
licence rather than yours: if `banks --country <yours>` does not show it, look under the licence country.

## 3. Keep it fresh

```bash
python3 tools/bank_sync.py sync          # every linked bank: balances + new transactions (re-reads the last 7 days)
python3 tools/bank_sync.py status        # consent days left per bank, last sync; exit 5 from 14 days before expiry
python3 tools/bank_sync.py export        # rebuild the repo files from the private raw copy (no network)
```

Banks allow about four unattended reads a day, so sync **once a day**: the tech-maintainer's suggested routine
[`daily-bank-sync`](../../agents/tech-maintainer/routines/daily-bank-sync.md), or a cron line
(`docs/setup/always-on-agents.md`). Write the consent expiry date into your credentials list; renewing is the same
`auth` as step 2, and only you can approve it in the bank's app.

## Troubleshooting

| Exit / message | Meaning | Fix |
| --- | --- | --- |
| 2 `not configured`, `no app_id`, `missing .../private.key` | step 1.5 not done | run `setup` |
| 2 `HTTP 401/403 ... app not active` | application not activated, wrong id or key | Control Panel: activate by linking accounts; check the id is the `.pem` file name |
| 1 `session created but NO accounts returned` | restricted mode sees only linked accounts | link them in the Control Panel, then `auth` again |
| 1 `'<name>' not found among the XX banks` | the bank name or country differs | `banks --country XX --find <part of the name>` |
| 3 `RENEW NEEDED` | consent expired or revoked at the bank | `auth` again (step 2) |
| 4 rate limit / temporary bank error | too many reads today, or the bank is down | wait ~6 h |
| `redirect URL ... not among the app's redirect URLs` | mismatch with the registered URL | `--redirect-url <registered one>` |

Every message names files and labels only: the tool never prints the private key, the token, a full session
id, an IBAN or a counterparty.

Related: [`data/finance/banks/README.md`](../../data/finance/banks/README.md), `tools/bank_sync.py`,
`tools/bank_export.py`, [`INSTALL.md`](../../INSTALL.md).
