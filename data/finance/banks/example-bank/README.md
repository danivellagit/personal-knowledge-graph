# EXAMPLE bank folder (invented values, delete when you add your own bank)

Rename this folder to your bank's slug (e.g. `mybank/`) and let your sync tool write:

- `accounts.md`: the account card (see `accounts.example.md`).
- `transactions/<bank>-YYYY-MM.md`: one file per month, written by `tools/bank_export.py` (see
  `transactions/example-bank-2030-01.example.md`).
- `monthly-totals.md` / `monthly-totals.json`: per month and currency: in, out, net, booked count, pending count.

How to read the month files: dates are booking dates; amounts are signed (negative = money out); moves between
your own accounts or pockets appear on both sides; category is UNKNOWN when the bank gives no card category code;
type is the bank's transaction code (CARD_PAYMENT, TRANSFER, ...); pending rows can still change and the next sync
overwrites the month.

Files: [[accounts.example]], [[example-bank-2030-01.example]]. Rules: [[finance/banks/README]]
