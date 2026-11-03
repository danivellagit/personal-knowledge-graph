"""Tests for tools/memory_compact.py (memory.md + monthly archive, agents/README.md rule 10).
Run: python3 -m unittest discover -s tools/tests  (from the repo root)"""
import collections, glob, os, shutil, subprocess, sys, tempfile, unittest

TOOL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "memory_compact.py")

MEM = """---
type: agent-memory
person: "[[_me]]"
---

# x memory

Related: [[_me]]

## Agreements
- 2026-09-01: rule one (owner's words)

## Sweep 2026-09-20 (from runner memory)
- an old fact
  continued

## Rules from the sweep (2026-10-02)
- standing rule

## Catalogue (2026-10-03)
| a | b |
| 1 | 2 |

## Log
- 2026-09-30: did a
  more about a
- 2026-10-28: did b
- 2026-11-01: did c
"""


def lines(paths):
    c = collections.Counter()
    for p in paths:
        c.update(l.replace(" <!-- keep -->", "") for l in open(p).read().split("\n") if l.strip())
    return c


class Compact(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.d = os.path.join(self.root, "data", "agents", "x")
        os.makedirs(self.d)
        self.mem = os.path.join(self.d, "memory.md")
        open(self.mem, "w").write(MEM)

    def tearDown(self):
        shutil.rmtree(self.root)

    def run_tool(self, *a):
        return subprocess.run([sys.executable, TOOL, "x"] + list(a), cwd=self.root,
                              capture_output=True, text=True)

    def all_files(self):
        return [self.mem] + glob.glob(os.path.join(self.d, "memory-archive", "*.md")) + \
            [p for p in glob.glob(os.path.join(self.d, "*.md")) if p != self.mem]

    def test_split_nothing_lost_and_idempotent(self):
        r = self.run_tool("--before", "2026-10-30", "--keep", "^## Rules from",
                          "--extract", "^## Catalogue=catalogue.md")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        new = open(self.mem).read()
        self.assertIn("## Agreements\n- 2026-09-01: rule one", new)            # undated: kept
        self.assertIn("## Rules from the sweep (2026-10-02) <!-- keep -->", new)
        self.assertNotIn("an old fact", new)                                    # dated: archived
        self.assertNotIn("did a", new)
        self.assertIn("- 2026-11-01: did c", new)                               # recent log kept
        self.assertIn("Moved verbatim to [`catalogue.md`]", new)
        self.assertTrue(new.startswith("---\ntype: agent-memory"))
        self.assertTrue(os.path.exists(os.path.join(self.d, "memory-archive", "2026-09.md")))
        self.assertTrue(os.path.exists(os.path.join(self.d, "memory-archive", "2026-10.md")))
        old = collections.Counter(l for l in MEM.split("\n") if l.strip())
        got = lines(self.all_files())
        self.assertEqual([l for l, c in old.items() if got[l] < c], [])
        snap = {p: open(p).read() for p in self.all_files()}
        r = self.run_tool("--before", "2026-10-30", "--extract", "^## Catalogue=catalogue.md")
        self.assertEqual(r.returncode, 0)
        self.assertEqual({p: open(p).read() for p in self.all_files()}, snap)   # second run: no-op

    def test_text_after_index_goes_to_log(self):
        self.run_tool("--before", "2026-10-30")
        with open(self.mem, "a") as f:
            f.write("- 2026-11-02 10:00: appended at the end\n")
        r = self.run_tool("--before", "2026-10-30")
        self.assertEqual(r.returncode, 0, r.stdout)
        new = open(self.mem).read()
        log = new[new.index("## Log"):new.index("## Archive")]
        self.assertIn("appended at the end", log)
        self.assertNotIn("appended at the end", new[new.index("## Archive"):])

    def test_dry_run_writes_nothing(self):
        r = self.run_tool("--before", "2026-10-30", "--dry-run")
        self.assertEqual(r.returncode, 0)
        self.assertEqual(open(self.mem).read(), MEM)
        self.assertFalse(os.path.exists(os.path.join(self.d, "memory-archive")))


if __name__ == "__main__":
    unittest.main()
