---
name: Example Bank accounts (EXAMPLE)
type: finance
---
# Example Bank accounts (EXAMPLE, invented values)

<!-- EXAMPLE file shipped with the template: invented values. Your sync tool generates the real accounts.md. -->

- Bank: Example Bank (EXAMPLE), personal account.
- Access: read-only PSD2 AIS through an open-banking provider: balances and transactions only, no payments.
- Consent valid until **2030-06-30 00:00 UTC** (EXAMPLE; 180 days max). Renew through your sync tool's auth
  step; warn 14 days before.
- Sync: about once a day. Last sync: 2030-01-31 07:00 UTC (EXAMPLE).

Labels are masked: currency + last 4 of the IBAN (main account) or of the bank's account id (pockets).

| Label | Type | Pocket | Currency | Transactions in repo |
| --- | --- | --- | --- | ---: |
| EUR-0001 | current | main | EUR | 3 |
| EUR-ab12 | pocket (savings) | Groceries | EUR | 1 |
