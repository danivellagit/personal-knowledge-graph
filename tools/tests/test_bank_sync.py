"""Tests for tools/bank_sync.py with the mock API (no network): setup, auth, sync, sanitized export, status.
Run: python3 -m unittest discover -s tools/tests  (from the repo root)"""
import glob, os, shutil, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "..", "bank_sync.py")
sys.path.insert(0, os.path.join(HERE, ".."))
import bank_export as be  # noqa: E402


def read(path):
    with open(path, encoding="utf8") as fh:
        return fh.read()


class MockSync(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.env = dict(os.environ, EB_SECRETS_DIR=os.path.join(self.d, "s"), EB_PRIVATE_DIR=os.path.join(self.d, "p"),
                        EB_REPO_DIR=os.path.join(self.d, "repo"))
        for k in ("EB_MOCK_EXTRA", "EB_MOCK_SESSION"):
            self.env.pop(k, None)

    def tearDown(self):
        shutil.rmtree(self.d)

    def run_tool(self, *a, env=None, code=0):
        r = subprocess.run([sys.executable, TOOL, "--mock"] + list(a), env=env or self.env, capture_output=True, text=True)
        self.assertEqual(r.returncode, code, r.stderr + r.stdout)
        return r.stdout + r.stderr

    def months(self):
        out = {}
        for f in sorted(glob.glob(os.path.join(self.d, "repo", "mybank", "transactions", "mybank-*.md"))):
            with open(f, encoding="utf8") as fh:
                out[os.path.basename(f)] = fh.read()
        return out

    def test_not_configured(self):
        self.assertIn("NOT SET", self.run_tool("status", code=2))

    def test_unknown_bank_name(self):
        self.run_tool("setup", "--app-id", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "--no-verify")
        out = self.run_tool("auth", "--bank", "mybank", "--aspsp", "Exampel", "--country", "XX", code=1)
        self.assertIn("not found", out)

    def test_auth_sync_export(self):
        self.run_tool("setup", "--app-id", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        self.assertIn("Example Bank", self.run_tool("banks", "--country", "XX"))
        out = self.run_tool("auth", "--bank", "mybank", "--aspsp", "example bank", "--country", "XX")
        self.assertIn("auth --bank mybank --code", out)
        self.run_tool("auth", "--bank", "mybank", "--code", "https://localhost/bank-callback?code=ok")
        first = self.months()
        self.assertTrue(first)
        repo_text = "\n".join(read(f) for f in glob.glob(os.path.join(self.d, "repo", "**", "*.*"), recursive=True))
        for bad in ("IT60X0542811101000000123456", "4111 1111 1111 1111", "3f2a9c1e", "tx-EUR-", "ref1 ", "| ref",
                    "XX000000000000000001", "1234.56", "mock-session", "aaaaaaaa-bbbb"):
            self.assertNotIn(bad, repo_text)
        self.assertEqual(be.find_ibans(repo_text, True) + be.find_cards(repo_text, True), [])
        self.assertIn("EUR-0001", repo_text)
        self.assertIn("Mock savings", repo_text)       # sub-account names from GET /accounts/{uid}/details
        with open(os.path.join(self.d, "repo", "mybank", "accounts.md"), encoding="utf8") as fh:
            self.assertIn("| EUR-0001 | current | main |", fh.read())
        self.assertTrue(os.path.exists(os.path.join(self.d, "repo", "mybank", "monthly-totals.json")))
        # raw data stays in the private folder, never in the repo folder
        self.assertTrue(glob.glob(os.path.join(self.d, "p", "mybank", "raw", "transactions-*.csv")))
        self.assertFalse(glob.glob(os.path.join(self.d, "repo", "**", "*.csv"), recursive=True))
        n = sum(t.count("\n| 20") for t in first.values())
        self.assertEqual(n, 8)                         # 7 EUR + 1 USD mock movements
        strip = lambda m: {k: "\n".join(l for l in v.splitlines() if "Generated" not in l) for k, v in m.items()}
        self.run_tool("export")
        self.assertEqual(strip(first), strip(self.months()))
        self.run_tool("sync", env=dict(self.env, EB_MOCK_EXTRA="1"))
        self.assertEqual(sum(t.count("\n| 20") for t in self.months().values()), 9)
        self.assertIn("days left", self.run_tool("status"))

    def test_revoked_session(self):
        self.run_tool("setup", "--app-id", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "--no-verify")
        self.run_tool("auth", "--bank", "mybank", "--aspsp", "Example Bank", "--country", "XX")
        self.run_tool("auth", "--bank", "mybank", "--code", "code=ok")
        out = self.run_tool("sync", env=dict(self.env, EB_MOCK_SESSION="revoked"), code=3)
        self.assertIn("RENEW NEEDED", out)

    def test_private_inside_repo_refused(self):
        env = dict(self.env, EB_PRIVATE_DIR=os.path.join(HERE, "..", "..", "data", "tmp-private"))
        self.run_tool("setup", "--app-id", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "--no-verify", env=env)
        self.run_tool("auth", "--bank", "mybank", "--aspsp", "Example Bank", "--country", "XX", env=env)
        out = self.run_tool("auth", "--bank", "mybank", "--code", "code=ok", env=env, code=1)
        self.assertIn("inside the repo", out)


if __name__ == "__main__":
    unittest.main()
