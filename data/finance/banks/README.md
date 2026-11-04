# Banks: accounts, transactions, statements (optional section)

Your bank data in the graph: one folder per bank (`<bank>/`, e.g. the `example-bank/` scaffolding shipped
here) plus `statements/` (an index of statement PDFs, which stay outside the repo). Read by the agent that runs
the bank sync (tech maintainer) and by the accountant agent for taxes and deadlines.

Like everything in `data/`, these files are gitignored by default in this template (`../../../.gitignore`);
only this scaffolding is tracked. Commit your own bank files only if you keep your copy of the repo PRIVATE.

## Privacy rules (enforced by `tools/bank_export.py` and `tools/precommit.py`)

Individual transactions may go in the (private) repo, but sanitized:

- **No card numbers**: any 13-19 digit run is masked to `****1234`.
- **No full IBANs**: only the last 4 characters (`IBAN ****1234`). Account labels are `CUR-xxxx`
  (currency + last 4 of the IBAN or of the bank's account id).
- **No bank reference / transaction ids**: the raw id columns are never exported, and UUIDs, `MB:`/`CRO:`-style
  references and long digit-heavy tokens inside descriptions become `[ref]`.
- **No balances** in the repo.
- If you sync a public template from your private copy, **exclude `data/finance/**` entirely** from that sync
  (in `tools/template_sync.py` terms: an `exclude` rule in your map file): your money never reaches the template,
  not even as structure.
- `tools/precommit.py` blocks, on every commit: raw bank exports (`transactions-YYYY-MM.csv`, `balances.json`,
  and `state.json` under `data/finance/`) anywhere, checksum-valid IBANs and Luhn-valid card numbers on any added
  line, and anything under `data/finance/banks/` that is not markdown (plus `<bank>/monthly-totals.json`) or
  carries a UUID.

## How data flows

1. **Open-banking provider** (PSD2 AIS, read-only: balances and transactions, no payments possible). You approve
   the consent in your bank's app; it lasts at most 180 days, track its expiry in your credentials list.
2. **The bank sync tool** reads new movements about once a day (banks allow ~4 unattended reads a day). Shipped:
   `tools/bank_sync.py`, read-only through Enable Banking (most EU / EEA banks and neobanks it lists; set up
   with `docs/setup/bank-enable-banking.md`). Another provider: write your own tool on top of `bank_export.py`.
3. **Private raw copy**, outside the repo (`~/private/finance/<bank>/` by default, mode 700): raw transactions
   with bank ids, balances, sync state. The provider's key and sessions live in `~/.secrets/enablebanking/`.
4. **Sanitized export into the repo** with `tools/bank_export.py` (`write_months(...)`), overwritten per month on
   every sync: `<bank>/transactions/<bank>-YYYY-MM.md`, plus your own `<bank>/accounts.md` card and
   `<bank>/monthly-totals.{md,json}`.

## Layout

| Path | What | Written by |
| --- | --- | --- |
| `<bank>/README.md` | how to read that bank's files | by hand |
| `<bank>/accounts.md` | account card: masked labels, sub-accounts / pockets, consent expiry, sync method | the sync tool |
| `<bank>/monthly-totals.md` / `.json` | per month: in, out, net, count, pending | the sync tool |
| `<bank>/transactions/<bank>-YYYY-MM.md` | one row per transaction: date, amount, currency, counterparty / description, category, type, account, status | `tools/bank_export.py` |
| `statements/README.md` | index of bank statements (PDFs stay private) | by hand |

The files in `example-bank/` are **EXAMPLES** with invented values: copy the shape, then delete them.

Related: [[finance/banks/statements/README]], [[finance/banks/example-bank/README]]
