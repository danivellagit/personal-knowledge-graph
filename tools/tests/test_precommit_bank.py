"""Tests for the bank guards of tools/precommit.py (layout under data/finance/banks/, IBAN / card numbers).
Runs the hook in a throwaway git repo. Run: python3 -m unittest discover -s tools/tests  (from the repo root)"""
import os, shutil, subprocess, sys, tempfile, unittest

TOOLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def valid_iban():
    # build a checksum-valid Italian IBAN at runtime (no real account): fix the check digits for a fake BBAN
    bban = "X0542811101000000654321"
    num = "".join(str(int(c, 36)) for c in bban + "IT00")
    return "IT%02d%s" % (98 - int(num) % 97, bban)


def valid_card():
    body = "411111111111123"
    for d in "0123456789":
        s = body + d
        tot = 0
        for i, ch in enumerate(reversed(s)):
            n = int(ch) * (2 if i % 2 else 1)
            tot += n - 9 if n > 9 else n
        if tot % 10 == 0:
            return s


class Hook(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.d, "tools"))
        for f in ("precommit.py", "bank_export.py"):
            shutil.copy(os.path.join(TOOLS, f), os.path.join(self.d, "tools", f))
        self.git("init", "-q")
        self.git("config", "user.email", "t@example.com")
        self.git("config", "user.name", "t")

    def tearDown(self):
        shutil.rmtree(self.d)

    def git(self, *a):
        return subprocess.run(["git"] + list(a), cwd=self.d, capture_output=True, text=True)

    def stage(self, path, text):
        p = os.path.join(self.d, path)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf8") as fh:
            fh.write(text)
        self.git("add", "-f", path)

    def hook(self):
        env = dict(os.environ, DK_PRECOMMIT_SKIP="lint,secrets,happiness", DK_PRECOMMIT_REASON="unit test")
        r = subprocess.run([sys.executable, "tools/precommit.py"], cwd=self.d, env=env, capture_output=True, text=True)
        return r.returncode, r.stderr

    def test_sanitized_month_passes(self):
        self.stage("data/finance/banks/example/transactions/example-2030-01.md",
                   "| 2030-01-05 | -12.50 | EUR | Shop · to IBAN ****3456 card ****1111 [ref] | UNKNOWN | CARD_PAYMENT | EUR-0001 | booked |\n")
        self.stage("data/finance/banks/example/monthly-totals.json", "{}\n")
        self.assertEqual(self.hook()[0], 0)

    def test_full_iban_blocked_anywhere(self):
        self.stage("data/people/someone.md", "pay to %s\n" % valid_iban())
        code, err = self.hook()
        self.assertEqual(code, 1)
        self.assertIn("full IBAN", err)
        self.assertNotIn(valid_iban(), err)             # never prints the value

    def test_card_blocked_anywhere(self):
        self.stage("agents/x/notes.md", "card %s\n" % valid_card())
        code, err = self.hook()
        self.assertEqual(code, 1)
        self.assertIn("card-like", err)

    def test_raw_exports_blocked(self):
        for p in ("data/finance/banks/example/raw.csv", "data/finance/banks/example/statement.json",
                  "somewhere/transactions-2030-01.csv", "data/finance/banks/example/balances.json"):
            self.git("reset", "-q")
            self.stage(p, "x\n")
            self.assertEqual(self.hook()[0], 1, p)

    def test_uuid_blocked_in_banks(self):
        self.stage("data/finance/banks/example/transactions/example-2030-01.md",
                   "| 2030-01-05 | -1.00 | EUR | To MB:3f2a9c1e-1b2c-4d5e-8f90-1a2b3c4d5e6f |\n")
        self.assertEqual(self.hook()[0], 1)

    def test_chat_ids_not_cards(self):
        self.stage("data/people/someone.md", "chat group id 120363000000000002, contact id 123456789012345\n")
        self.assertEqual(self.hook()[0], 0)


if __name__ == "__main__":
    unittest.main()
