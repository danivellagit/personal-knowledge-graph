#!/usr/bin/env python3
"""Instance configuration: who the owner is, and where the optional external layers live.

    python3 tools/config.py get <dotted.key> [default]   # print one value (used by the .sh tools)
    python3 tools/config.py show                          # every key this instance has set

Lookup order for every key: environment variable (when the key has one) -> config.local.yml ->
the default. Only the owner identity (`owner`, `owner_slug`) also falls back to
config.example.yml, so a fresh clone has a sane identity before anything is configured; paths and
integrations never come from the example file, because its placeholder paths are not real.

Deliberately dependency-free: no PyYAML. The parser reads the subset this repo's config uses —
`key: value` scalars, nested maps (flattened to dotted keys, `body.db`), block lists
(`- item`) and flow lists (`[a, b]`) — and ignores anything it does not understand.
"""

import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL = os.path.join(REPO, "config.local.yml")
EXAMPLE = os.path.join(REPO, "config.example.yml")

# The owner's own node is always data/_me.md (LEGEND, "owner"): tools WRITE this slug.
OWNER_NODE = "_me"

_CACHE = {}


def _strip_comment(s):
    """'value   # note' -> 'value', quote-aware."""
    quote = None
    for i, ch in enumerate(s):
        if quote:
            if ch == quote:
                quote = None
            continue
        if ch in "\"'":
            quote = ch
            continue
        if ch == "#" and (i == 0 or s[i - 1].isspace()):
            return s[:i].rstrip()
    return s.rstrip()


def _scalar(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    if v.startswith("[") and v.endswith("]"):
        return [_scalar(x) for x in v[1:-1].split(",") if x.strip()]
    return v


def parse(path):
    """Flatten a simple YAML file into {dotted.key: str | list}."""
    out = {}
    if not os.path.exists(path):
        return out
    stack = []            # [(indent, key)]
    last_key = None
    with open(path, encoding="utf8") as fh:
        for raw in fh:
            line = _strip_comment(raw.rstrip("\n"))
            if not line.strip():
                continue
            indent = len(line) - len(line.lstrip(" "))
            body = line.strip()
            if body.startswith("- "):
                # list item: belongs to the last key that opened a block
                if last_key is not None:
                    cur = out.get(last_key)
                    if not isinstance(cur, list):
                        cur = []
                    item = body[2:].strip()
                    if ":" in item and not item.startswith(("\"", "'")):
                        continue          # list of maps (e.g. `sources:`): not flattened
                    cur.append(_scalar(item))
                    out[last_key] = cur
                continue
            if ":" not in body:
                continue
            key, _, val = body.partition(":")
            key = key.strip()
            while stack and stack[-1][0] >= indent:
                stack.pop()
            full = ".".join([k for _, k in stack] + [key])
            if val.strip():
                out[full] = _scalar(val)
                last_key = None
            else:
                stack.append((indent, key))
                last_key = full
    return out


def _load(path):
    if path not in _CACHE:
        _CACHE[path] = parse(path)
    return _CACHE[path]


def get(key, default=None, env=None, example=False):
    """One config value. `env` names an environment variable that wins over the file."""
    if env and os.environ.get(env, "").strip():
        return os.environ[env].strip()
    v = _load(LOCAL).get(key)
    if v in (None, "", []) and example:
        v = _load(EXAMPLE).get(key)
    if v in (None, "", []):
        return default
    return v


def get_list(key, default=(), env=None):
    """A list value; a scalar is split on commas (`"a, b"` and `[a, b]` both work)."""
    v = get(key, None, env)
    if v is None:
        return list(default)
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    return [x.strip() for x in str(v).split(",") if x.strip()]


def get_path(key, env=None):
    """A filesystem path (with ~ expanded), or None when unset."""
    v = get(key, None, env)
    return os.path.expanduser(str(v)) if v else None


def owner():
    """The owner's display name, e.g. "Ada Quill"."""
    return str(get("owner", "the owner", "PKG_OWNER", example=True))


def owner_first():
    name = owner()
    return name.split()[0] if name and name != "the owner" else "the owner"


def owner_slug():
    """The owner's slug. Defaults to the owner node `_me`."""
    return str(get("owner_slug", OWNER_NODE, "PKG_OWNER_SLUG", example=True))


def owner_slugs():
    """Every slug that means "the owner": the owner node, plus `owner_slug` if it differs."""
    return {OWNER_NODE, owner_slug()}


def enabled(layer):
    """An optional module (`body`, `location`, `agents`) is off when `<layer>.enabled` says so."""
    v = str(get(layer + ".enabled", "") or "").strip().lower()
    return v not in ("false", "no", "off", "0")


def chdir_repo():
    """Run every tool from the repo root, so `data/...` resolves wherever it was called from.

    The tools always read the graph at <repo>/data. A `data_dir` pointing anywhere else is not
    supported (node types are derived from the data/<type>/ layout), so say so instead of
    silently linting an empty graph.
    """
    os.chdir(REPO)
    dd = get("data_dir")
    if dd and os.path.realpath(os.path.join(REPO, os.path.expanduser(str(dd)))) != \
            os.path.realpath(os.path.join(REPO, "data")):
        sys.stderr.write("warning: data_dir=%s is ignored; the tools read %s\n"
                         % (dd, os.path.join(REPO, "data")))


def not_configured(layer, keys):
    """Fail soft: an optional layer that is not set up is a message, never a traceback."""
    base = layer.split()[0].lower()
    if not enabled(base):
        print("%s layer is switched off (`%s.enabled: false` in config.local.yml) — nothing to do."
              % (layer, base))
        sys.exit(0)
    print("%s layer not configured — nothing to do." % layer)
    for k, e in keys:
        print("  set `%s` in config.local.yml%s" % (k, (" or the env var %s" % e) if e else ""))
    print("  (optional layer: the rest of the graph works without it)")
    sys.exit(0)


def main():
    a = sys.argv[1:]
    if a and a[0] == "get" and len(a) >= 2:
        v = get(a[1], a[2] if len(a) > 2 else "")
        if isinstance(v, list):
            v = ",".join(v)
        print(os.path.expanduser(str(v)) if str(v).startswith("~") else v)
    elif a and a[0] == "show":
        for k, v in sorted(_load(LOCAL).items()):
            print("%s = %r" % (k, v))
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
