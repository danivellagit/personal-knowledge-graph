"""Every check that can be run over the graph, as data.

Split out of `lint.py` so that both the linter and the gap register see exactly the same
findings, and so every finding carries a **stable id**. The id is what makes a gap trackable
across days: `partner-unnamed:ada-quill` is the same gap tomorrow, so it can carry a
first-seen date, an attempt count and eventually a closing evidence line.

Two classes, never mixed:
  MECH — provably right, `lint.py --fix` applies it.
  GAP  — needs a human or a re-read of the stream. Reported, never guessed.

Instance-specific vocabulary is data, not code. It comes from the graph itself (company, city and
group names are qualifiers, never surnames) and from optional keys in config.local.yml:

  checks.qualifier_words   extra words that disambiguate rather than name ("founder", a team)
  checks.kin_slugs         person slugs that are kin by role ("mom"): never asked for a surname
  checks.nicknames         "short=long, ..." nickname pairs used by the duplicate detector
  checks.common_tokens     alias tokens too common to mean anything (your company's domain)
  checks.stop_words        capitalised words that are never a venue ("Monday", your own name)
"""

import os
import re
import datetime
import collections

from graph import (load_nodes, load_interactions, load_body, links_of,
                   RULE_MAP, SYMMETRIC, BODY_SECTIONS)
import config

MECH = "MECH"
GAP = "GAP"
SOFT = "SOFT"          # a gap that is arguably fine; reported, never chased

STALE_DAYS = 45
FOLLOWUP_STALE_DAYS = 14
ROLLUP_KEEP_DAYS = 60

OWNERS = config.owner_slugs()

# Words that disambiguate rather than name: "Olmo Founder", "Wren (Globex)", "Man From Gym" all
# have two tokens and still are not a person's name. Per person, the names of the company, city
# and groups the node already links to count too (see `qualifiers_for`); config can add more.
BASE_QUALIFIERS = {"founder", "cofounder", "ceo", "cto", "boss", "guy", "man", "woman", "uomo",
                   "donna", "friend", "amico", "amica", "from", "gym", "work", "office"}
QUALIFIER_WORDS = set(BASE_QUALIFIERS) | {w.lower() for w in config.get_list("checks.qualifier_words")}

# kin addressed by role, not by name: they never get a "what is the surname?" gap
KIN = {"mom", "mum", "mother", "dad", "father", "mamma", "papa", "papà", "nonna", "nonno",
       "grandma", "grandpa"} | {s.lower() for s in config.get_list("checks.kin_slugs")}


def _words(v):
    return [w for w in re.split(r"[^\wàèéìòù]+", str(v or "").lower()) if w]


def qualifiers_for(n, nodes):
    """The words that cannot be this person's surname: the base list, plus the names of the
    company, cities and groups the node itself points at.

    The failure this replaces: a nickname saved as "<first name> <company>" reads as a full name
    with two tokens, so the person never got a surname gap and later forked into a duplicate.
    Scoped to the person's own edges on purpose: a company called like a common surname must not
    turn every person with that surname into a "missing surname" gap.
    """
    out = set(QUALIFIER_WORDS)
    out.update(w for w in _words(n.get("company")) if len(w) > 2)
    for f in ("works_at", "lives_in", "member_of"):
        for t in n.link_list(f):
            tn = nodes.get(t)
            vals = [t] + ([tn.get("name")] + list(tn.get("aliases") or []) if tn else [])
            for v in vals:
                out.update(w for w in _words(v) if len(w) > 2)
    return out


def slug_is_placeholder(slug, quals=QUALIFIER_WORDS):
    """A one-word slug, or one carrying a qualifier: `olmo`, `wren-globex`."""
    toks = slug.split("-")
    return len(toks) == 1 or any(t in quals for t in toks)


def name_is_incomplete(name, quals=QUALIFIER_WORDS):
    nm = str(name or "").strip().strip('"')
    if "(" in nm or ")" in nm:
        return True                    # "Wren (Globex)" — a note, not a surname
    toks = _words(nm)
    if len(toks) < 2:
        return True
    return any(t in quals for t in toks)


STOP = set("""
january february march april may june july august september october november december
gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre
monday tuesday wednesday thursday friday saturday sunday english italian spanish french german
italy italia spain spagna europe europa eu us usa uk claude notion whatsapp
gmail linkedin fireflies google slack figma obsidian hubspot shopify amazon zoom teams meet
""".split()) | {w.lower() for w in config.get_list("checks.stop_words")} | {
    w.lower() for w in config.owner().split() if config.owner() != "the owner"}

VENUE_RE = re.compile(
    r"\b(?:al|allo|alla|at|da|presso|in)\s+"
    r"((?:[A-Z][\wàèéìòù'&]+)(?:\s+(?:[A-Z][\wàèéìòù'&]+|e|de|di|del|la|el))*)")


def unquoted_links(value):
    """Every `[[` in a frontmatter value that is NOT immediately preceded by a quote.

    This is the bug that once made the Obsidian graph a star with a ring of hundreds of orphans
    around it. YAML does not know what a wiki-link is:

        person: [[ada-quill]]     -> a list containing a list containing a string
        person: "[[ada-quill]]"   -> a string containing a wiki-link

    Only the second one is a link. Obsidian resolves wiki-links inside frontmatter *strings*,
    so the unquoted form renders as `[["ada-quill"]]`, registers zero references, and the
    file sits outside the graph forever. `links_of()` here reads both forms with a regex, which
    is exactly why nothing ever noticed: **the tooling was tolerant and Obsidian was not.**

    Almost every interaction file had been written this way. Anything a sweep writes must be quoted.

    "Quoted" means the `[[` sits inside a YAML string, so quote state is tracked rather than
    just looking at the previous character. These are all fine:
        relationship: ["[[colleague]]"]        flow list of quoted strings
        - "her ex [[dario-lenz]] works there"  a link mid-prose inside a quoted item
    and these are not:
        person: [[ada-quill]]
        - her ex [[dario-lenz]] works there
    """
    v = str(value or "")
    bad, quote, i = [], None, 0
    while i < len(v):
        ch = v[i]
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif v[i:i + 2] == "[[":
            bad.append(i)
            i += 1
        i += 1
    return bad


class Finding:
    """One check result. `id` is stable across runs; `detail` is free text."""

    __slots__ = ("cls", "kind", "id", "detail", "subject", "question", "priority", "fix")

    def __init__(self, cls, kind, id, detail, subject="", question="", priority=5, fix=None):
        self.cls = cls
        self.kind = kind
        self.id = id
        self.detail = detail
        self.subject = subject
        self.question = question      # what to literally go and ask / look for
        self.priority = priority      # 1 = chase first
        self.fix = fix                # (target_node, field, slug) for mechanical edge fixes

    def __repr__(self):
        return "<%s %s %s>" % (self.cls, self.kind, self.id)


def collect(root="data", today=None):
    today = today or datetime.date.today()
    nodes = load_nodes(root)
    inter = load_interactions(root)
    body = load_body(root)
    out = []
    slugs = set(nodes)

    def emit(*a, **kw):
        out.append(Finding(*a, **kw))

    # ------------------------------------------------------------------ MECH
    for n in nodes.values():
        for i in n.issues:
            emit(MECH, "broken-frontmatter", "shape:%s:%s" % (n.slug, i[:24]),
                 "%s — %s" % (n.path, i), n.slug)

    # Unquoted wiki-links: invisible to Obsidian, so the file is an orphan in the graph even
    # though every tool here reads it fine. See `unquoted_links()` for the full story.
    def quote_links(target):
        """Wrap every wiki-link value in this file's frontmatter in double quotes."""
        def apply():
            touched = False
            for e in target.entries:
                k = e.get("key")
                if not k or k == "aliases":
                    continue
                if e["kind"] == "scalar":
                    if unquoted_links(e["value"]):
                        e["value"] = '"%s"' % e["value"].strip()
                        touched = True
                else:
                    for it in e["items"]:
                        if unquoted_links(it["value"]):
                            it["value"] = '"%s"' % it["value"].strip()
                            touched = True
            if touched:
                target.dirty = True
                # lint.py's write loop only walks nodes + interactions, so a template has to
                # persist itself or --fix would report a repair it never wrote to disk.
                if target.path.startswith("skills" + os.sep):
                    target.write()
            return touched
        return apply

    # The templates are checked too, because they are where this bug actually came from: the
    # interaction template once shipped unquoted, was never touched, and every sweep
    # copied it. Fixing the data without fixing the mould just buys one day.
    templates = []
    for dirpath, _, filenames in os.walk("skills"):
        if os.path.basename(dirpath) != "templates":
            continue
        for f in sorted(filenames):
            if f.endswith(".md"):
                p = os.path.join(dirpath, f)
                from graph import Node as _Node
                templates.append(_Node(p, open(p, encoding="utf8", errors="ignore").read()))

    for target in list(nodes.values()) + list(inter) + body + templates:
        bad = []
        for e in target.entries:
            k = e.get("key")
            if not k or k == "aliases":
                continue
            vals = [e["value"]] if e["kind"] == "scalar" else [i["value"] for i in e["items"]]
            if any(unquoted_links(v) for v in vals):
                bad.append(k)
        if bad:
            emit(MECH, "unquoted-link", "unquoted:%s" % target.path,
                 "%s :: %s — unquoted [[link]]: YAML reads it as nested arrays, so Obsidian "
                 "registers no reference and the file is an orphan in the graph"
                 % (target.path, ", ".join(sorted(set(bad)))),
                 target.slug, fix=quote_links(target))

    # Nothing is allowed to be unattached: every interaction must anchor to a person that exists.
    for ix in inter:
        if ix.person in OWNERS:
            continue          # the owner's own episodes hang off data/_me.md by design
        anchors = ix.link_list("person")
        if not anchors:
            emit(MECH, "interaction-unanchored", "unanchored:%s" % ix.path,
                 "%s — no `person:` anchor, so it hangs off nothing" % ix.path, ix.person)
            continue
        for a in anchors:
            if a not in slugs and a not in OWNERS:
                emit(GAP, "dangling-edge", "dangle:%s:person:%s" % (ix.path, a),
                     "%s :: person -> [[%s]] (no such node)" % (ix.path, a), a,
                     question="does [[%s]] exist under another spelling, or is the node missing?" % a,
                     priority=1)
            elif a != ix.person and ix.person not in OWNERS:
                emit(MECH, "interaction-misfiled", "misfiled:%s" % ix.path,
                     "%s :: person -> [[%s]] but it lives in interactions/%s/"
                     % (ix.path, a, ix.person), ix.person)

    for n in nodes.values():
        for e in n.entries:
            k = e.get("key")
            if not k:
                continue
            ls = n.link_list(k)
            d = sorted({s for s in ls if ls.count(s) > 1})
            if d:
                emit(MECH, "duplicate-links", "dupe:%s:%s" % (n.slug, k),
                     "%s :: %s -> %s" % (n.path, k, ", ".join(d)), n.slug)

    for n in nodes.values():
        for (st, fwd), (tt, rev) in RULE_MAP.items():
            if n.type != st:
                continue
            for t in n.link_list(fwd):
                tn = nodes.get(t)
                if tn is None:
                    continue
                if tn.type != tt:
                    emit(MECH, "wrong-target-type", "type:%s:%s:%s" % (n.slug, fwd, t),
                         "%s :: %s -> [[%s]] is a %s, expected %s"
                         % (n.path, fwd, t, tn.type, tt), n.slug)
                elif n.slug not in tn.link_list(rev):
                    emit(MECH, "missing-reverse", "rev:%s:%s:%s" % (tn.slug, rev, n.slug),
                         "%s needs %s: [[%s]]  (from %s :: %s)"
                         % (tn.path, rev, n.slug, n.path, fwd), tn.slug,
                         fix=(tn, rev, n.slug))

    for n in nodes.values():
        for f in SYMMETRIC:
            for t in n.link_list(f):
                tn = nodes.get(t)
                if tn is not None and n.slug not in tn.link_list(f):
                    emit(MECH, "one-way-symmetric", "sym:%s:%s:%s" % (tn.slug, f, n.slug),
                         "%s needs %s: [[%s]]  (from %s)" % (tn.path, f, n.slug, n.path),
                         tn.slug, fix=(tn, f, n.slug))

    for n in nodes.values():
        for field, heading in BODY_SECTIONS.items():
            ls = n.link_list(field)
            if not ls:
                continue
            m = re.search(r"^## %s\n((?:[ \t]*-[^\n]*\n)*)" % re.escape(heading), n.body, re.M)
            if m and set(links_of(m.group(1).split("\n"))) != set(ls):
                emit(MECH, "body-list-desync", "body:%s:%s" % (n.slug, field),
                     "%s :: ## %s" % (n.path, heading), n.slug)

    for ix in inter:
        for t in ix.link_list("at"):
            tn = nodes.get(t)
            if tn is None:
                emit(GAP, "dangling-edge", "dangle:%s:at:%s" % (ix.path, t),
                     "%s :: at -> [[%s]]" % (ix.path, t), t, priority=3)
            elif tn.type != "places":
                emit(MECH, "at-wrong-type", "atype:%s:%s" % (ix.path, t),
                     "%s :: at -> [[%s]] is a %s (city -> `city:`, passion -> `about:`)"
                     % (ix.path, t, tn.type))

    for n in nodes.values():
        for e in n.entries:
            k = e.get("key")
            if not k or k == "aliases":
                continue
            for t in n.link_list(k):
                if t not in slugs and t not in OWNERS:
                    emit(GAP, "dangling-edge", "dangle:%s:%s:%s" % (n.slug, k, t),
                         "%s :: %s -> [[%s]]" % (n.path, k, t), t,
                         question="does [[%s]] exist under another spelling, or is the node missing?" % t,
                         priority=2)

    # The body layer (tools/body.py, LEGEND §1). A body day is episodic like an interaction:
    # outbound links only, no reverse edges. Its link fields still have to point at the right
    # node type, or a passion ends up in `at:` the way it did in the interactions.
    BODY_TYPES = {"with": "people", "at": "places", "activities": "passions", "contacts": "people",
                  "met": "people", "last_before_sleep": "people", "first_after_wake": "people",
                  "late_night": "people", "top_chats": "people", "group_chats": "groups",
                  "city": "cities", "places": "places", "events_on_day": "events"}
    for b in body:
        for i in b.issues:
            emit(MECH, "broken-frontmatter", "shape:%s:%s" % (b.path, i[:24]),
                 "%s — %s" % (b.path, i), b.path)
        for field, want in BODY_TYPES.items():
            for t in b.link_list(field):
                tn = nodes.get(t)
                if tn is not None and tn.type != want:
                    emit(MECH, "body-wrong-type", "btype:%s:%s:%s" % (b.path, field, t),
                         "%s :: %s -> [[%s]] is a %s, expected %s" % (b.path, field, t, tn.type, want))

    # ------------------------------------------------------------------- GAP
    # A sport session the body recorded and the graph cannot place: who was there, where?
    # `tools/body.py days` lists them in `sessions_open`; resolving one means adding `with`/`at`
    # (or the HH:MM to `sessions_resolved` when it was solo) — the generator keeps both.
    for b in body:
        for s_ in b.get("sessions_open") or []:
            s_ = s_.strip('"')
            emit(GAP, "body-session-unattributed", "body-session:%s:%s" % (b.date, s_.split(" ")[0]),
                 "%s :: %s %s" % (b.path, b.date, s_), config.OWNER_NODE,
                 question="%s %s — who was there and where? (WhatsApp that day, the calendar)"
                 % (b.date, s_), priority=4)

    # the owner is not a contact: never asked for a surname, a city or a duplicate check
    people = {s: n for s, n in nodes.items() if n.type == "people" and s not in OWNERS}

    # co-presence
    pair = collections.Counter()
    for ix in inter:
        cast = sorted({ix.person} | set(ix.link_list("with")))
        for i, a in enumerate(cast):
            for b in cast[i + 1:]:
                pair[(a, b)] += 1
    hubs = collections.defaultdict(set)
    for s, n in people.items():
        for f in ("works_at", "member_of", "events"):
            hubs[s].update(n.link_list(f))

    def linked(a, b):
        na, nb = nodes.get(a), nodes.get(b)
        if not na or not nb:
            return True
        for f in SYMMETRIC + ["introduced", "introduced_by", "mentors", "mentored_by"]:
            if b in na.link_list(f) or a in nb.link_list(f):
                return True
        return False

    for (a, b), c in pair.items():
        if c < 2 or linked(a, b):
            continue
        shared = hubs[a] & hubs[b]
        key = "copresence:%s|%s" % (a, b)
        if shared:
            emit(SOFT, "copresence-hub-only", key,
                 "%dx  %s <-> %s   via %s" % (c, a, b, ", ".join(sorted(shared))))
        else:
            emit(GAP, "copresence-no-path", key, "%dx  %s <-> %s" % (c, a, b), a,
                 question="%s and %s shared %d interactions — how do they know each other?"
                          % (a, b, c), priority=1)

    # possible duplicate people — the failure mode that hit repeatedly before it was detectable:
    # a first name saved as a nickname in one source ("Tobi" for `tobia-quillon`, or
    # "Tobi Acme") forked into a second node that then accumulated its own interactions.
    def norm(v):
        return re.sub(r"[^a-z0-9]+", "", str(v or "").lower())

    COMMON = {"com", "gmail", "it", "org", "net", "www", "linkedin",
              "the", "and", "srl", "spa", "ltd", "inc"} | {
        w.lower() for w in config.get_list("checks.common_tokens")}

    def tokens(n):
        """Name tokens only — an alias that is an email or a handle is not a name."""
        vals = [n.get("name")] + list(n.get("aliases") or [])
        out = set()
        for v in vals:
            v = str(v or "").strip().strip("\"'")
            if "@" in v or v.startswith("http") or re.search(r"\d", v):
                continue          # email / url / handle-with-digits: not a human name
            for w in re.split(r"[^\wàèéìòù]+", v.lower()):
                if len(w) > 2 and w not in COMMON:
                    out.add(w)
        return out

    quals = {s: qualifiers_for(n, nodes) for s, n in people.items()}

    def incomplete_name(s, n):
        """The fork signature: one side is a nickname/placeholder, not a full name."""
        return slug_is_placeholder(s, quals[s]) or name_is_incomplete(n.get("name"), quals[s])

    # Short-form <-> full-name pairs, e.g. `checks.nicknames: "bob=robert, liz=elizabeth"` in
    # config.local.yml. Add the ones your own contacts actually use: this is the pair that lets
    # "Liz" in one source meet "Elizabeth" in another.
    NICK = []
    for pair in config.get_list("checks.nicknames"):
        if "=" in pair:
            x, y = (t.strip().lower() for t in pair.split("=", 1))
            if x and y:
                NICK.append((x, y))

    def name_affinity(a, b):
        ta, tb = tokens(a), tokens(b)
        if ta & tb:
            return True
        for x, y in NICK:
            if (x in ta and y in tb) or (y in ta and x in tb):
                return True
        return False

    days = collections.defaultdict(set)
    for ix in inter:
        days[ix.person].add(ix.date)

    plist = [(s, n) for s, n in sorted(people.items()) if s not in KIN]
    for i, (sa, na) in enumerate(plist):
        for sb, nb in plist[i + 1:]:
            why = []
            pa, pb = norm(na.get("phone")), norm(nb.get("phone"))
            if pa and pa == pb:
                why.append("same phone")
            ea = norm((na.get("links") or None) or na.get("email"))
            eb = norm((nb.get("links") or None) or nb.get("email"))
            if ea and ea == eb:
                why.append("same email")
            ca, cb = norm(na.get("company")), norm(nb.get("company"))
            same_company = bool(ca and cb and (ca in cb or cb in ca))
            shared_city = bool(set(na.link_list("lives_in")) & set(nb.link_list("lives_in")))
            shared_days = days[sa] & days[sb]
            # A name match only matters when one of the two is a nickname or placeholder.
            # Two people who both have a full surname are two people, however alike the
            # first names are (ines-varga and ines-bersani are not one Ines).
            if name_affinity(na, nb) and (incomplete_name(sa, na) or incomplete_name(sb, nb)):
                if same_company:
                    why.append("nickname node + same company (%s)" % (na.get("company")
                                                                      or nb.get("company")))
                elif shared_city and shared_days:
                    why.append("nickname node + same city + %d shared dates"
                               % len(shared_days))
                elif shared_days:
                    why.append("nickname node + %d shared interaction dates"
                               % len(shared_days))
            if not why:
                continue
            emit(GAP, "possible-duplicate", "dupe-person:%s|%s" % (sa, sb),
                 "%s <-> %s — %s" % (sa, sb, "; ".join(why)), sa,
                 question="are %s and %s the same person? If yes, merge (never fork)" % (sa, sb),
                 priority=1)

    # names. The charter is about the NAME ("names or it did not happen"), so a full name in a
    # one-word slug is not a gap — it is a slug worth renaming eventually, which is a different,
    # softer thing. Keeping them apart stops `name:olmo` looking unresolved after the surname
    # has actually been found.
    for s, n in people.items():
        if s in KIN:
            continue
        nm = str(n.get("name") or "").strip('"')
        if name_is_incomplete(nm, quals[s]):
            emit(GAP, "no-full-name", "name:%s" % s, "%s (name: %s)" % (n.path, nm), s,
                 question="what is %s's surname?" % (nm or s), priority=2)
        elif slug_is_placeholder(s, quals[s]):
            emit(SOFT, "slug-is-a-placeholder", "slug:%s" % s,
                 "%s — name is '%s' but the slug is still a placeholder" % (n.path, nm))

    # partners
    for s, n in people.items():
        partner = str(n.get("partner") or "").strip().strip('"')
        if not partner:
            if re.search(r"\b(moglie|marito|fidanzat|girlfriend|boyfriend|wife|husband|compagn)",
                         n.body, re.I):
                emit(GAP, "partner-in-prose-only", "partnerfield:%s" % s, n.path, s,
                     question="%s's partner is described in the body but not in `partner:`" % s,
                     priority=3)
        elif "NAME UNKNOWN" in partner:
            emit(GAP, "partner-unnamed", "partner:%s" % s, "%s — %s" % (n.path, partner[:90]), s,
                 question="what is the name of %s's partner?" % s, priority=2)

    # location
    for s, n in people.items():
        if n.link_list("lives_in"):
            continue
        based = n.get("based")
        if based:
            emit(GAP, "based-not-linked", "based:%s" % s, "%s — %s" % (n.path, based), s,
                 question="turn %s's `based:` into a city node + `lives_in`" % s, priority=3)
        else:
            emit(GAP, "no-location", "loc:%s" % s, n.path, s,
                 question="where does %s live?" % s, priority=4)

    # introductions, as one standing gap
    n_intro = sum(1 for n in people.values() if n.link_list("introduced_by"))
    if people:
        emit(SOFT, "introduction-graph-thin", "meta:introductions",
             "%d/%d people carry `introduced_by`" % (n_intro, len(people)))

    # recurring proper nouns with no node
    blob = "\n".join(open(ix.path, encoding="utf8", errors="ignore").read() for ix in inter)
    known = set()
    for s, n in nodes.items():
        known.add(s)
        for v in [n.get("name")] + (n.get("aliases") or []):
            if isinstance(v, str) and v.strip():
                low = v.strip().strip("\"'").lower()
                known.add(low)
                known.add(re.sub(r"[^a-z0-9]+", "-", low).strip("-"))
    cand = collections.Counter(m.group(1).strip() for m in VENUE_RE.finditer(blob))
    for name, c in cand.items():
        low = name.lower()
        if (c < 4 or len(name) < 4 or low in known
                or re.sub(r"[^a-z0-9]+", "-", low).strip("-") in known
                or low in STOP or low.split()[0] in STOP or low.endswith("'s")):
            continue
        emit(GAP, "proper-noun-no-node", "noun:%s" % re.sub(r"[^a-z0-9]+", "-", low),
             "%dx  %s" % (c, name), name,
             question="is \"%s\" a place, a city or a company? %d mentions, no node" % (name, c),
             priority=4)

    # staleness / rollup / follow-ups
    last = {}
    for ix in inter:
        if re.match(r"^\d{4}-\d{2}-\d{2}$", ix.date):
            last[ix.person] = max(last.get(ix.person, ""), ix.date)
    for s, d in last.items():
        age = (today - datetime.date.fromisoformat(d)).days
        if age > STALE_DAYS:
            emit(SOFT, "cold-contact", "cold:%s" % s, "%s — last %s (%dd)" % (s, d, age), s)

    old = collections.Counter()
    for ix in inter:
        if re.match(r"^\d{4}-\d{2}-\d{2}$", ix.date) and \
                (today - datetime.date.fromisoformat(ix.date)).days > ROLLUP_KEEP_DAYS:
            old[ix.person] += 1
    for s, c in old.items():
        emit(GAP, "needs-rollup", "rollup:%s" % s, "%s — %d dailies older than %dd"
             % (s, c, ROLLUP_KEEP_DAYS), s,
             question="roll %s's old dailies into a monthly file" % s, priority=4)

    fu = os.path.join(root, "_followups")
    if os.path.isdir(fu):
        for f in sorted(os.listdir(fu)):
            m = re.match(r"^(\d{4}-\d{2}-\d{2})\.md$", f)
            if not m:
                continue
            age = (today - datetime.date.fromisoformat(m.group(1))).days
            if age <= FOLLOWUP_STALE_DAYS:
                continue
            txt = open(os.path.join(fu, f), encoding="utf8", errors="ignore").read()
            n_open = len(re.findall(r"^\s*-\s*(?:\[ \]\s*)?\S", txt, re.M))
            n_done = len(re.findall(r"^\s*-\s*\[x\]", txt, re.M | re.I))
            if n_open and not n_done:
                emit(GAP, "followup-never-closed", "followup:%s" % m.group(1),
                     "%s — %d items, 0 closed, %dd old" % (f, n_open, age), f,
                     question="are the %d items in %s done, dead, or still open?" % (n_open, f),
                     priority=3)

    # ---------------------------------------------------------------------------------
    # Nothing is unattached. Every .md under data/ must have at least one wiki-link in or
    # out, resolved the way OBSIDIAN resolves it (by basename, anywhere in the vault, and
    # in frontmatter only inside quoted strings). A file with neither is invisible in the
    # graph view and unreachable from any brief.
    #
    # Found from the graph view itself: a dense core with a ring of hundreds of dots around
    # it. Cause was `person: [[slug]]` unquoted in almost every interaction, which is now
    # `unquoted-link` above. This check is the backstop for every other way it can happen.
    # ---------------------------------------------------------------------------------
    # Only two files are exempt, each a decision: the structure note that ships with the
    # template, and the gap register's generated view (empty of links on a fresh graph).
    ORPHAN_EXEMPT = {os.path.join(root, "README.md"), os.path.join(root, "_gaps", "OPEN.md")}

    all_md = {}
    for dirpath, _, filenames in os.walk(root):
        for f in filenames:
            if f.endswith(".md"):
                p = os.path.join(dirpath, f)
                all_md[p] = open(p, encoding="utf8", errors="ignore").read()

    by_basename = {}
    for p in all_md:
        by_basename.setdefault(os.path.basename(p)[:-3], p)

    def obsidian_links(text):
        """Every link Obsidian would resolve: body links, plus frontmatter links inside strings.

        Code is not linked by Obsidian, so fenced blocks and inline code spans are stripped
        first — otherwise a documented `person: "[[ada-quill]]"` example in data/README.md
        reads as a real edge to a person who does not exist.
        """
        m = re.match(r"^---\n(.*?)\n---\n?", text, re.S)
        fm, body = (m.group(1), text[m.end():]) if m else ("", text)
        body = re.sub(r"^```.*?^```", "", body, flags=re.S | re.M)   # fenced blocks
        body = re.sub(r"`[^`\n]*`", "", body)                        # inline code spans
        quoted = []
        for line in fm.split("\n"):
            q, buf = None, ""
            for ch in line:
                if q:
                    if ch == q:
                        q = None
                    else:
                        buf += ch
                elif ch in "\"'":
                    q = ch
            quoted.append(buf)
        LINK = re.compile(r"\[\[([^\]|#]+)")
        return [x.strip() for x in LINK.findall("\n".join(quoted)) + LINK.findall(body)]

    outbound = collections.defaultdict(set)
    inbound = collections.defaultdict(set)
    for p, text in all_md.items():
        for t in obsidian_links(text):
            # `[[body-2026-10-05\|Mon 05 Oct]]` is the table-safe alias form; the `\` belongs to
            # the escaped pipe, not to the name.
            t = t.rstrip("\\")
            tp = by_basename.get(t)
            if tp is None and "/" in t:
                # Path links, resolved from the vault root the way Obsidian does. Interaction
                # files share basenames (one `2026-10-01.md` per person), so the body layer
                # links them by path: [[interactions/ada-quill/2026-10-01]].
                cand = os.path.join(root, t + ".md")
                tp = cand if cand in all_md else None
            if tp is None:
                emit(GAP, "unresolved-link", "unresolved:%s:%s" % (p, t),
                     "%s -> [[%s]] resolves to no file in the vault" % (p, t), t,
                     question="create [[%s]], fix the spelling, or unlink it" % t, priority=2)
                continue
            if tp != p:
                outbound[p].add(tp)
                inbound[tp].add(p)

    for p in sorted(all_md):
        if p in ORPHAN_EXEMPT:
            continue
        if not outbound[p] and not inbound[p]:
            emit(MECH, "orphan-file", "orphan-file:%s" % p,
                 "%s — no wiki-link in and none out: invisible in the graph, unreachable from a brief"
                 % p, os.path.basename(p)[:-3])

    # light nodes nothing points at
    for s, n in nodes.items():
        if n.type in ("people", "companies"):
            continue
        inbound = 0
        for other in nodes.values():
            if other.slug == s:
                continue
            for e in other.entries:
                k = e.get("key")
                if k and k != "aliases" and s in other.link_list(k):
                    inbound += 1
        refs = sum(1 for ix in inter
                   if s in links_of([ix.get("about"), ix.get("at"), ix.get("city")]))
        if not inbound and not refs:
            emit(GAP, "orphan-light-node", "orphan:%s" % s, n.path, s,
                 question="wire [[%s]] to something or delete it" % s, priority=4)

    return nodes, inter, out
