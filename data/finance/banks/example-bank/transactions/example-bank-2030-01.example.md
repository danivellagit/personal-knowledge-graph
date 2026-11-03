---
name: Example Bank transactions 2030-01 (EXAMPLE)
type: finance
month: 2030-01
rows: 4
---

# Example Bank transactions, 2030-01 (EXAMPLE, invented values)

<!-- EXAMPLE file shipped with the template: the shape tools/bank_export.py writes. Invented values. -->

Sanitized export: no card numbers, IBANs only as last 4, no bank reference or transaction ids. Amounts are signed (negative = money out). Moves between own accounts/pockets appear on both sides.

| Date | Amount | Currency | Counterparty / description | Category | Type | Account | Status |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| 2030-01-02 | 1500.00 | EUR | Example Employer · Salary January | UNKNOWN | TRANSFER | EUR-0001 | booked |
| 2030-01-05 | -40.00 | EUR | To EUR Groceries | UNKNOWN | TRANSFER | EUR-0001 | booked |
| 2030-01-05 | 40.00 | EUR | To EUR Groceries | UNKNOWN | TRANSFER | EUR-ab12 | booked |
| 2030-01-09 | -12.50 | EUR | Example Grocer · card ****0000 [ref] | groceries | CARD_PAYMENT | EUR-ab12 | booked |

Accounts: EUR-0001 = main; EUR-ab12 = Groceries
