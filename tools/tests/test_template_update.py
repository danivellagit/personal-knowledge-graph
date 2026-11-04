"""Tests for tools/template_update.py on throwaway git repos (a fake template and a user's clone; no network).
Run: python3 -m unittest discover -s tools/tests  (from the repo root)"""
import json, os, shutil, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)


def sh(cwd, *a):
    r = subprocess.run(list(a), cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        raise AssertionError("%s: %s%s" % (" ".join(a), r.stdout, r.stderr))
    return r.stdout


def write(root, path, text):
    p = os.path.join(root, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf8") as fh:
        fh.write(text)


def read(root, path):
    with open(os.path.join(root, path), encoding="utf8") as fh:
        return fh.read()


GIT_ENV = {"GIT_AUTHOR_NAME": "Test", "GIT_AUTHOR_EMAIL": "test@users.noreply.github.com",
           "GIT_COMMITTER_NAME": "Test", "GIT_COMMITTER_EMAIL": "test@users.noreply.github.com"}


class TemplateUpdate(unittest.TestCase):
    def setUp(self):
        os.environ.update(GIT_ENV)
        self.d = tempfile.mkdtemp()
        self.up = os.path.join(self.d, "template")
        os.makedirs(self.up)
        sh(self.up, "git", "init", "-q", "-b", "main")
        os.makedirs(os.path.join(self.up, "tools"))
        for f in ("template_update.py", "config.py"):
            shutil.copy(os.path.join(TOOLS, f), os.path.join(self.up, "tools", f))
        write(self.up, "skills/a/SKILL.md", "line 1\nline 2\nline 3\nline 4\nline 5\n")
        write(self.up, "tools/x.py", "print('x')\n")
        write(self.up, "data/README.md", "template data readme\n")
        write(self.up, "README.md", "readme v1\n")
        sh(self.up, "git", "add", "-A")
        sh(self.up, "git", "commit", "-q", "-m", "v1")
        self.user = os.path.join(self.d, "user")
        sh(self.d, "git", "clone", "-q", self.up, self.user)

    def tearDown(self):
        shutil.rmtree(self.d)

    def tool(self, *a, code=0):
        r = subprocess.run([sys.executable, os.path.join(self.user, "tools", "template_update.py")] + list(a),
                           cwd=self.user, capture_output=True, text=True)
        self.assertEqual(r.returncode, code, r.stdout + r.stderr)
        return r.stdout + r.stderr

    def upstream_v2(self):
        write(self.up, "skills/a/SKILL.md", "line 1 (better)\nline 2\nline 3\nline 4\nline 5\n")
        write(self.up, "skills/b/SKILL.md", "a new skill\n")
        write(self.up, "tools/x.py", "print('x2')\n")
        write(self.up, "data/README.md", "template data readme v2\n")
        write(self.up, "README.md", "readme v2\n")
        sh(self.up, "git", "add", "-A")
        sh(self.up, "git", "commit", "-q", "-m", "v2: better skill a, new skill b")

    def test_flow(self):
        self.assertIn("not initialised", self.tool(code=2))
        out = self.tool("init", "--url", self.up)
        self.assertIn("renamed git remote `origin`", out)
        self.assertEqual(sh(self.user, "git", "remote").split(), ["upstream"])
        self.assertIn("no longer tracks", out)          # git pull / the hooks never pull the template in unasked
        v = json.loads(read(self.user, ".template-version"))
        self.assertEqual(v["base"], sh(self.up, "git", "rev-parse", "HEAD").strip())
        self.assertIn("up to date", self.tool())
        # the user edits their copy: a skill (end of file), a tool (same line as upstream), their data
        write(self.user, "skills/a/SKILL.md", "line 1\nline 2\nline 3\nline 4\nline 5\nmy own note\n")
        write(self.user, "tools/x.py", "print('mine')\n")
        write(self.user, "data/README.md", "MY DATA\n")
        self.upstream_v2()
        out = self.tool(code=10)                       # dry run: lists, changes nothing
        self.assertIn("DRY RUN", out)
        self.assertIn("merges cleanly", out)
        self.assertIn("CONFLICT", out)
        self.assertIn("Never touched", out)
        self.assertIn("data/README.md", out)
        self.assertEqual(read(self.user, "README.md"), "readme v1\n")
        items = json.loads(self.tool("--json", "--no-fetch", code=10))["items"]
        ids = {i["path"]: i["id"] for i in items}
        self.assertNotIn("data/README.md", ids)
        # install only the skills group
        self.tool("apply", "skills")
        self.assertEqual(read(self.user, "skills/a/SKILL.md"), "line 1 (better)\nline 2\nline 3\nline 4\nline 5\nmy own note\n")
        self.assertEqual(read(self.user, "skills/b/SKILL.md"), "a new skill\n")
        self.assertEqual(read(self.user, "README.md"), "readme v1\n")
        self.assertEqual(read(self.user, "data/README.md"), "MY DATA\n")
        v = json.loads(read(self.user, ".template-version"))
        self.assertEqual(v["base"], sh(self.up, "git", "rev-parse", "HEAD").strip())
        self.assertIn("README.md", v["deferred"])
        # deferred items are offered again; the conflict is skipped without markers
        out = self.tool("--no-fetch", code=10)
        self.assertIn("README.md", out)
        self.assertNotIn("skills/b", out)
        self.tool("decline", "tools/x.py", "--no-fetch")
        self.tool("apply", "all", "--no-fetch", "--commit")
        self.assertEqual(read(self.user, "README.md"), "readme v2\n")
        self.assertEqual(read(self.user, "tools/x.py"), "print('mine')\n")   # declined: untouched
        self.assertIn("up to date", self.tool("--no-fetch"))
        self.assertIn(".template-version", sh(self.user, "git", "show", "--name-only", "HEAD"))
        self.assertEqual(read(self.user, "data/README.md"), "MY DATA\n")

    def test_conflict_markers(self):
        self.tool("init", "--url", self.up)
        write(self.user, "tools/x.py", "print('mine')\n")
        self.upstream_v2()
        items = json.loads(self.tool("--json", code=10))["items"]
        n = [i["id"] for i in items if i["path"] == "tools/x.py"][0]
        self.assertIn("skipped", self.tool("apply", str(n), "--no-fetch"))
        self.assertEqual(read(self.user, "tools/x.py"), "print('mine')\n")
        self.tool("apply", "tools", "--no-fetch", "--with-conflict-markers")
        self.assertIn("<<<<<<< yours", read(self.user, "tools/x.py"))


if __name__ == "__main__":
    unittest.main()
