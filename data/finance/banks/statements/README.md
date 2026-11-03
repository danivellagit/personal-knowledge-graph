# Bank statements (index only)

Statement PDFs (monthly / annual statements, tax certificates from the bank) **stay private**: in a folder
outside the repo (e.g. `~/private/finance/<bank>/statements/`) or in your document system. `tools/precommit.py`
blocks PDFs under `data/`. This file only lists them, so an agent knows what exists and where to ask.

| Bank | Period | Kind | Where (private) | Added |
| --- | --- | --- | --- | --- |
| Example Bank (EXAMPLE) | 2030-01 | monthly statement | `~/private/finance/example-bank/statements/2030-01.pdf` | 2030-02-01 |

Related: [[finance/banks/README]]
