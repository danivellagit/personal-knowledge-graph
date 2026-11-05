"""Tests for dated edges in tools/graph.py (since/until, LEGEND.md 2b) and the edge-dates lint.
Run: python3 -m unittest discover -s tools/tests  (from the repo root)

Edges have optional since/until so a past job is closed, not kept
as "(ex-...)" prose. Undated edges must behave exactly as before."""
import datetime, os, shutil, subprocess, sys, tempfile, unittest

TOOLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, TOOLS)
import graph  # noqa: E402

PERSON = """---
name: Wren Halvorsen
aliases: [Mario]
works_at:
  - "[[acme]]"
  - "[[northwind]]"
knows:
  - "[[luisa]]"    # met at padel
links:
  linkedin: https://example.org/mario
---

# Wren Halvorsen
"""


def node(text, path="data/people/wren-halvorsen.md"):
    return graph.Node(path, text)


class DatedEdges(unittest.TestCase):
    def test_undated_node_unchanged(self):
        n = node(PERSON)
        self.assertEqual(n.render_frontmatter() + n.body, PERSON)
        self.assertEqual(n.edge_dates(), {})
        self.assertEqual(n.edge_date_problems(), [])
        self.assertEqual(n.current_links("works_at"), ["acme", "northwind"])
        self.assertEqual(n.past_links("works_at"), [])

    def test_set_and_read_back(self):
        n = node(PERSON)
        n.set_edge_dates("works_at", "northwind", since="2018-03", until="2021-06", note='left for "Acme"')
        n.set_edge_dates("works_at", "acme", since="2021-07")
        txt = n.render_frontmatter() + n.body
        self.assertIn('edge_dates:\n  works_at:\n    "[[acme]]": {since: 2021-07}\n'
                      '    "[[northwind]]": {since: 2018-03, until: 2021-06, note: "left for \\"Acme\\""}\n', txt)
        back = node(txt)
        self.assertEqual(back.issues, [])
        self.assertEqual(back.edge_dates()[("works_at", "northwind")],
                         {"since": "2018-03", "until": "2021-06", "note": 'left for "Acme"'})
        self.assertEqual(back.edge_date_problems(), [])
        # links, comments and nested maps untouched
        self.assertEqual(back.link_list("works_at"), ["acme", "northwind"])
        self.assertIn('  - "[[luisa]]"    # met at padel', txt)
        self.assertIn("  linkedin: https://example.org/mario", txt)
        # idempotent render
        self.assertEqual(back.render_frontmatter(), n.render_frontmatter())

    def test_current_and_past(self):
        n = node(PERSON)
        n.set_edge_dates("works_at", "northwind", since="2018", until="2021-06")
        on = datetime.date(2026, 11, 2)
        self.assertEqual(n.current_links("works_at", on), ["acme"])
        self.assertEqual(n.past_links("works_at", on), ["northwind"])
        self.assertTrue(n.edge_is_current("works_at", "northwind", datetime.date(2021, 6, 30)))
        self.assertFalse(n.edge_is_current("works_at", "northwind", datetime.date(2021, 7, 1)))
        self.assertFalse(n.edge_is_current("works_at", "northwind", datetime.date(2017, 12, 31)))
        n.set_edge_dates("works_at", "acme", until="UNKNOWN")
        self.assertEqual(n.current_links("works_at", on), [])

    def test_remove_dates_keeps_edge(self):
        n = node(PERSON)
        n.set_edge_dates("works_at", "northwind", until="2021")
        n.set_edge_dates("works_at", "northwind")
        self.assertEqual(n.render_frontmatter() + n.body, PERSON)

    def test_refusals(self):
        n = node(PERSON)
        with self.assertRaises(ValueError):
            n.set_edge_dates("works_at", "nobody", until="2020")
        with self.assertRaises(ValueError):
            n.set_edge_dates("works_at", "northwind", until="June 2021")

    def test_problems(self):
        bad = PERSON.replace("---\n\n#", 'edge_dates:\n  works_at:\n'
                             '    "[[northwind]]": {since: 2022, until: 2021}\n'
                             '    "[[ghost]]": {until: 2020}\n'
                             '    "[[acme]]": {since: 2020, role: cto}\n'
                             '    "[[acme]]": {until: soon}\n---\n\n#')
        probs = node(bad).edge_date_problems()
        text = "\n".join(probs)
        self.assertIn("since 2022 is after until 2021", text)
        self.assertIn("ghost", text)
        self.assertIn("unknown attribute role", text)
        self.assertIn("duplicate entry", text)
        self.assertIn("'soon' is not", text)


class LintAndCli(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        for d in ("people", "companies"):
            os.makedirs(os.path.join(self.root, "data", d))
        with open(os.path.join(self.root, "data", "people", "wren-halvorsen.md"), "w") as f:
            f.write(PERSON.replace('knows:\n  - "[[luisa]]"    # met at padel\n', ""))
        for c in ("acme", "northwind"):
            with open(os.path.join(self.root, "data", "companies", c + ".md"), "w") as f:
                f.write('---\nname: %s\naliases: []\ntype: company\npeople:\n  - "[[wren-halvorsen]]"\n---\n' % c)

    def tearDown(self):
        shutil.rmtree(self.root)

    def run_graph(self, *args):
        return subprocess.run([sys.executable, os.path.join(TOOLS, "graph.py")] + list(args),
                              cwd=self.root, capture_output=True, text=True)

    def mech_kinds(self):
        sys.path.insert(0, TOOLS)
        import checks
        cwd = os.getcwd()
        os.chdir(self.root)
        try:
            _, _, f = checks.collect("data", today=datetime.date(2026, 11, 2))
        finally:
            os.chdir(cwd)
        return sorted({x.kind for x in f if x.cls == checks.MECH})

    def test_cli_and_lint(self):
        self.assertEqual(self.mech_kinds(), [])
        r = self.run_graph("date", "wren-halvorsen", "works_at", "northwind", "--since", "2018-03", "--until", "2021-06")
        self.assertEqual(r.returncode, 0, r.stderr)
        r = self.run_graph("dates", "wren-halvorsen")
        self.assertIn("works_at -> [[northwind]]  {since: 2018-03, until: 2021-06}  (past)", r.stdout)
        r = self.run_graph("current", "wren-halvorsen", "works_at", "--on", "2026-11-02")
        self.assertEqual(r.stdout.split(), ["acme"])
        self.assertEqual(self.mech_kinds(), [])          # dated edge = clean lint, reverse intact
        r = self.run_graph("date", "wren-halvorsen", "works_at", "ghost", "--until", "2020")
        self.assertEqual(r.returncode, 2)
        # a dangling date entry is a mechanical finding
        p = os.path.join(self.root, "data", "people", "wren-halvorsen.md")
        txt = open(p).read().replace('"[[northwind]]": {', '"[[ghost]]": {')
        open(p, "w").write(txt)
        self.assertIn("edge-dates-invalid", self.mech_kinds())
        r = self.run_graph("undate", "wren-halvorsen", "works_at", "northwind")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('"[[ghost]]": {since: 2018-03, until: 2021-06}', open(p).read())  # never dropped
        open(p, "a").write("")
        txt = open(p).read().replace('"[[ghost]]": {since: 2018-03, until: 2021-06}', '"[[ghost]]" since 2018')
        open(p, "w").write(txt)
        r = self.run_graph("date", "wren-halvorsen", "works_at", "acme", "--since", "2021")
        self.assertEqual(r.returncode, 2)                  # refuses while a line is malformed


if __name__ == "__main__":
    unittest.main()
