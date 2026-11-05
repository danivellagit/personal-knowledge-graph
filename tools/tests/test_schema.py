"""Tests for tools/schema.py (frontmatter schema per node type, LEGEND.md 1b).
Run: python3 -m unittest discover -s tools/tests  (from the repo root)"""
import os, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import graph, schema  # noqa: E402


def node(fm, path="data/people/wren-halvorsen.md"):
    return graph.Node(path, "---\n%s\n---\n\n# x\n" % fm)


class Schema(unittest.TestCase):
    def test_template_person_is_clean(self):
        here = os.path.dirname(os.path.abspath(__file__))
        p = os.path.join(here, "..", "..", "skills", "remember-people", "templates", "person.md")
        n = graph.Node("data/people/wren-halvorsen.md", open(p, encoding="utf8").read())
        self.assertEqual(schema.check_node(n), [])

    def test_edges_and_edge_dates_allowed(self):
        n = node('name: A\nworks_at:\n  - "[[acme]]"\nknows:\n  - "[[b]]"\nintroduced:\n  - "[[c]]"\n'
                 'edge_dates:\n  works_at:\n    "[[acme]]": {until: 2020}')
        self.assertEqual(schema.check_node(n), [])

    def test_divergent_and_unknown(self):
        n = node("name: A\nbirthday:\nborn: 1981\nage: 36\nbank: x\nbank2: y")
        got = {(k, key) for k, key, _ in schema.check_node(n)}
        self.assertEqual(got, {("frontmatter-divergent-field", "born"),
                               ("frontmatter-divergent-field", "age"),
                               ("frontmatter-unknown-field", "bank"),
                               ("frontmatter-unknown-field", "bank2")})

    def test_per_type(self):
        ev = node("name: E\ndate: 2026-01-01\nend_date: 2026-01-02\nplace:\n  - \"[[x]]\"",
                  "data/events/e.md")
        self.assertEqual([k for _, k, _ in schema.check_node(ev)], ["end_date"])
        co = node("name: C\nhq: Lisbon\npeople:\n  - \"[[a]]\"", "data/companies/c.md")
        self.assertEqual(schema.check_node(co), [])
        self.assertEqual(schema.check_node(node("x: 1", "data/body/body-2026-01-01.md")), [])


if __name__ == "__main__":
    unittest.main()
