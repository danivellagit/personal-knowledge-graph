#!/usr/bin/env python3
"""The food log: meal photos -> data/food/, one file per day, every meal remembered.

    python3 tools/food.py add PHOTO [--time HH:MM] [--date YYYY-MM-DD] [--no-photo]
    python3 tools/food.py table          # totals per day, data/food/food-log.md, ingredients.md

`add` stores the photo (resized to 1280 px JPEG, so the private data does not swell), opens or
creates data/food/food-<date>.md and appends an empty meal block for a coach agent (or a sweep)
to fill from the photo: what, ingredients, portion, the estimate line, where and with whom, the
owner's own words. Time and date default to the photo's own creation time. With --no-photo, PHOTO
is ignored and the block says `photo: none`. Resizing uses `sips` (macOS) or Pillow if either is
available; otherwise the photo is copied as it is.

`table` reads the filled blocks back: the estimate line
    - **Estimate:** ~650 kcal · protein 35 g · carbs 70 g · fat 22 g (estimate)
is the older shape and still counts. The current one is the `Nutrients:` line: every nutrient in
NUTRIENTS (energy, macros, fat types, cholesterol, salt, minerals, vitamins, caffeine, alcohol).
Per day: kcal and the four macros in the frontmatter, every nutrient with its % of the EU reference
intake in a generated "Day totals" section; every day becomes a row of food-log.md, and every
ingredient line is counted into ingredients.md (what is eaten, how often, when last).

Every number is an estimate from a photo unless the block says otherwise. The coach writes it as
one; nothing here pretends to be a nutrition label.
"""

import datetime as dt
import glob
import os
import re
import shutil
import subprocess
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from graph import Node  # noqa: E402
import config  # noqa: E402

ME = config.OWNER_NODE

OUT = os.path.join("data", "food")
PHOTOS = os.path.join(OUT, "photos")
# Every nutrient the coach estimates for every meal, in this order, as one line:
#   - **Nutrients:** energy 650 kcal · protein 22 g · carbs 95 g · ... · caffeine 0 mg (estimate)
# (key, label in the line, unit, EU reference intake for an adult from the label regulation
#  1169/2011, or None where the regulation sets none). The RI is a label convention, not a target.
NUTRIENTS = [
    ("energy_kcal", "energy", "kcal", 2000), ("protein_g", "protein", "g", 50),
    ("carbs_g", "carbs", "g", 260), ("sugar_g", "sugar", "g", 90), ("fiber_g", "fiber", "g", None),
    ("fat_g", "fat", "g", 70), ("saturated_fat_g", "saturated fat", "g", 20),
    ("mono_fat_g", "monounsaturated fat", "g", None), ("poly_fat_g", "polyunsaturated fat", "g", None),
    ("omega3_g", "omega-3", "g", None), ("cholesterol_mg", "cholesterol", "mg", None),
    ("salt_g", "salt", "g", 6), ("potassium_mg", "potassium", "mg", 2000),
    ("calcium_mg", "calcium", "mg", 800), ("phosphorus_mg", "phosphorus", "mg", 700),
    ("magnesium_mg", "magnesium", "mg", 375), ("iron_mg", "iron", "mg", 14), ("zinc_mg", "zinc", "mg", 10),
    ("iodine_ug", "iodine", "µg", 150), ("selenium_ug", "selenium", "µg", 55),
    ("vitamin_a_ug", "vitamin A", "µg", 800), ("vitamin_d_ug", "vitamin D", "µg", 5),
    ("vitamin_e_mg", "vitamin E", "mg", 12), ("vitamin_k_ug", "vitamin K", "µg", 75),
    ("vitamin_c_mg", "vitamin C", "mg", 80), ("vitamin_b1_mg", "vitamin B1", "mg", 1.1),
    ("vitamin_b2_mg", "vitamin B2", "mg", 1.4), ("vitamin_b3_mg", "vitamin B3", "mg", 16),
    ("vitamin_b6_mg", "vitamin B6", "mg", 1.4), ("folate_ug", "folate", "µg", 200),
    ("vitamin_b12_ug", "vitamin B12", "µg", 2.5), ("caffeine_mg", "caffeine", "mg", None),
    ("alcohol_g", "alcohol", "g", None),
]
NUM = r"(\d+(?:[.,]\d+)?)"
NUTR_LINE = re.compile(r"^- \*\*Nutrients:\*\*(.*)$", re.M)
NUTR_RE = {k: re.compile(r"(?<![\w-])" + re.escape(lab) + r"\s+~?" + NUM + r"\s*" + re.escape(u), re.I)
           for k, lab, u, _ in NUTRIENTS}
# the older one-line shape (kept readable): ~650 kcal · protein 35 g · carbs 70 g · fat 22 g [· fiber · sugar · salt]
EST = re.compile(r"~?\s*" + NUM + r"\s*kcal\s*·\s*protein\s*" + NUM + r"\s*g\s*·\s*carbs\s*" + NUM
                 + r"\s*g\s*·\s*fat\s*" + NUM + r"\s*g"
                 + r"(?:\s*·\s*fiber\s*" + NUM + r"\s*g)?(?:\s*·\s*sugar\s*" + NUM + r"\s*g)?"
                 + r"(?:\s*·\s*salt\s*" + NUM + r"\s*g)?", re.I)
EST_KEYS = ("energy_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "salt_g")
TOTALS = tuple(k + "_est" for k, _, _, _ in NUTRIENTS)
GEN_START = "<!-- food:totals:start — rewritten by tools/food.py table -->"
GEN_END = "<!-- food:totals:end -->"


def meal_nutrients(body):
    """One dict per meal that has numbers: the Nutrients line if present, else the old Estimate line."""
    out = []
    for block in re.split(r"(?m)^## \d\d:\d\d · ", body)[1:]:
        m = NUTR_LINE.search(block)
        if m:
            d = {}
            for k, rx in NUTR_RE.items():
                x = rx.search(m.group(1))
                if x:
                    d[k] = float(x.group(1).replace(",", "."))
            if d:
                out.append(d)
                continue
        e = EST.search(block)
        if e:
            out.append({k: float(v.replace(",", ".")) for k, v in zip(EST_KEYS, e.groups()) if v})
    return out
MEAL_H = re.compile(r"^## (\d\d:\d\d) · ", re.M)


def meal_name(hhmm):
    h = int(hhmm[:2])
    if h < 5:
        return "late night"
    if h < 11:
        return "breakfast"
    if h < 16:
        return "lunch"
    if h < 19:
        return "snack"
    return "dinner"


def photo_time(path):
    """The photo's creation time, local; falls back to the file's mtime."""
    try:
        out = subprocess.run(["mdls", "-raw", "-name", "kMDItemContentCreationDate", path],
                             capture_output=True, text=True).stdout.strip()
        t = dt.datetime.strptime(out, "%Y-%m-%d %H:%M:%S %z").astimezone()
        return t
    except (ValueError, OSError):
        return dt.datetime.fromtimestamp(os.path.getmtime(path))


def resize(src, dst):
    """1280 px JPEG at quality 75: sips on macOS, else Pillow, else a plain copy. '' on success."""
    if shutil.which("sips"):
        r = subprocess.run(["sips", "-Z", "1280", "-s", "format", "jpeg", "-s", "formatOptions", "75",
                            src, "--out", dst], capture_output=True, text=True)
        return "" if r.returncode == 0 else (r.stderr.strip() or "sips failed")
    try:
        from PIL import Image  # optional dependency
        im = Image.open(src)
        im.thumbnail((1280, 1280))
        im.convert("RGB").save(dst, "JPEG", quality=75)
        return ""
    except ImportError:
        shutil.copyfile(src, dst)
        print("note: no sips or Pillow, photo copied without resizing")
        return ""
    except OSError as e:
        return str(e)


def day_file(date):
    path = os.path.join(OUT, "food-%s.md" % date)
    if not os.path.exists(path):
        weekday = dt.date.fromisoformat(date).strftime("%A %-d %B %Y")
        body = 'body: "[[body-%s]]"' % date if os.path.exists("data/body/body-%s.md" % date) else "body:"
        text = "\n".join([
            "---", "type: food-day", 'person: "[[%s]]"' % ME, "date: %s" % date, body,
            "meals: 0", "kcal_est:", "protein_g_est:", "carbs_g_est:", "fat_g_est:", "nutrients: see the Day totals section",
            "with:", "at:", "---", "",
            "# %s — food" % weekday, "",
            "_Meals in the order eaten. Every number is an estimate from the photo unless it says otherwise._",
            "",
        ])
        os.makedirs(OUT, exist_ok=True)
        open(path, "w", encoding="utf8").write(text)
    return path


def add(args):
    date = time_ = None
    no_photo = "--no-photo" in args
    if "--date" in args:
        date = args[args.index("--date") + 1]
    if "--time" in args:
        time_ = args[args.index("--time") + 1]
    src = args[0] if args and not args[0].startswith("--") else None
    src = os.path.abspath(os.path.expanduser(src)) if src else None
    config.chdir_repo()
    if not no_photo and (not src or not os.path.exists(src)):
        sys.exit("photo not found: %s (use --no-photo for a meal without one)" % src)
    if not no_photo and (not date or not time_):
        t = photo_time(src)
        date = date or t.date().isoformat()
        time_ = time_ or t.strftime("%H:%M")
    now = dt.datetime.now()
    date = date or now.date().isoformat()
    time_ = time_ or now.strftime("%H:%M")

    photo_line = "photo: none"
    if not no_photo:
        os.makedirs(PHOTOS, exist_ok=True)
        base = "food-%s-%s" % (date, time_.replace(":", ""))
        name, k = base + ".jpg", 2
        while os.path.exists(os.path.join(PHOTOS, name)):
            name, k = "%s-%d.jpg" % (base, k), k + 1
        dst = os.path.join(PHOTOS, name)
        err = resize(src, dst)
        if err or not os.path.exists(dst):
            sys.exit("could not convert the photo: %s" % err)
        photo_line = "![[%s]]" % name

    path = day_file(date)
    heading = "## %s · %s" % (time_, meal_name(time_))
    block = "\n".join([
        "", heading, photo_line,
        "- **What:** TODO",
        "- **Ingredients:** TODO",
        "- **Portion:** TODO",
        "- **Nutrients:** TODO  (every nutrient of tools/food.py NUTRIENTS, in order: energy 650 kcal · protein 22 g · ... · alcohol 0 g (estimate))",
        "- **Where / with:**",
        "- **Own words:**",
        "",
    ])
    text = open(path, encoding="utf8").read().rstrip("\n") + "\n" + block
    open(path, "w", encoding="utf8").write(text)
    print("%s :: %s" % (path, heading))


def set_scalar(text, key, value):
    v = "" if value is None else " %s" % value
    return re.sub(r"^%s:.*$" % re.escape(key), "%s:%s" % (key, v), text, count=1, flags=re.M)


def table():
    rows, ingredients = [], defaultdict(lambda: [0, ""])
    if not glob.glob(os.path.join(OUT, "food-20*.md")):
        print("no food days yet (data/food/food-YYYY-MM-DD.md): nothing to tabulate.")
        return
    for p in sorted(glob.glob(os.path.join(OUT, "food-20*.md"))):
        text = open(p, encoding="utf8").read()
        n = Node(p, text)
        date = (n.get("date") or "").strip('"')
        meals = len(MEAL_H.findall(n.body))
        for line in re.findall(r"^- \*\*Ingredients:\*\*(.*)$", n.body, re.M):
            for ing in re.split(r"[,;]", line):
                ing = re.sub(r"\(.*?\)", "", ing).strip().strip(".").lower()
                if ing and ing not in ("todo", "unknown"):
                    ingredients[ing][0] += 1
                    ingredients[ing][1] = max(ingredients[ing][1], date)
        meals_n = meal_nutrients(n.body)
        counted = len(meals_n)
        tot = {k: round(sum(m.get(k, 0) for m in meals_n), 1) for k, _, _, _ in NUTRIENTS}
        new = text
        for k, short in (("energy_kcal", "kcal_est"), ("protein_g", "protein_g_est"),
                         ("carbs_g", "carbs_g_est"), ("fat_g", "fat_g_est")):
            new = set_scalar(new, short, int(round(tot[k])) if counted else None)
        new = re.sub(r"^(fiber|sugar|salt)_g_est:.*\n", "", new, flags=re.M)   # superseded by the section
        new = set_scalar(new, "meals", meals)
        section = ""
        if counted:
            rows_ = ["| nutrient | day total | % of EU reference intake |", "| --- | --- | --- |"]
            for k, lab, u, ri in NUTRIENTS:
                have = sum(1 for m in meals_n if k in m)
                if not have:
                    continue
                v = tot[k]
                vs = ("%d" % v) if v >= 10 or u == "kcal" else ("%.1f" % v)
                rows_.append("| %s | %s %s%s | %s |" % (lab, vs, u, "" if have == counted else
                                                        " (%d of %d meals)" % (have, counted),
                                                        "%d%%" % round(100 * v / ri) if ri else "—"))
            section = (GEN_START + "\n## Day totals (estimate)\n\n" + "\n".join(rows_)
                       + "\n\n_Reference intakes are the EU label values for an average adult, not a personal target._\n"
                       + GEN_END + "\n")
        new = re.sub(re.escape(GEN_START) + r".*?" + re.escape(GEN_END) + r"\n?", "", new, flags=re.S).rstrip("\n") + "\n"
        if section:
            new += "\n" + section
        if new != text:
            open(p, "w", encoding="utf8").write(new)
            if Node(p, new).issues:
                raise RuntimeError("food table broke %s" % p)
        tot = [tot[k] for k in ("energy_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "salt_g")]
        rows.append((date, meals, counted, tot))

    lines = ["---", "type: food-log", 'person: "[[%s]]"' % ME, "---", "",
             "# Food — daily table", "",
             "_Generated by `python3 tools/food.py table`; do not edit. Estimates from photos, summed only "
             "over the meals that have an estimate (column `est`)._", "",
             "| day | meals | est | kcal | protein g | carbs g | fat g | fiber g | sugar g | salt g |",
             "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for date, meals, counted, t in sorted(rows, reverse=True):
        lines.append("| [[food-%s\\|%s]] | %d | %d | %s | %s | %s | %s | %s | %s | %s |" % (
            date, dt.date.fromisoformat(date).strftime("%a %d %b"), meals, counted,
            *((("%d" % x) if i < 6 else ("%.1f" % x)) if counted else "—" for i, x in enumerate(t))))
    open(os.path.join(OUT, "food-log.md"), "w", encoding="utf8").write("\n".join(lines) + "\n")

    ing = ["---", "type: food-ingredients", 'person: "[[%s]]"' % ME, "---", "",
           "# Ingredients — everything eaten", "",
           "_Generated by `python3 tools/food.py table` from the `Ingredients:` lines; do not edit._", "",
           "| ingredient | meals | last |", "| --- | --- | --- |"]
    for k, (cnt, last) in sorted(ingredients.items(), key=lambda kv: (-kv[1][0], kv[0])):
        ing.append("| %s | %d | [[food-%s]] |" % (k, cnt, last))
    open(os.path.join(OUT, "ingredients.md"), "w", encoding="utf8").write("\n".join(ing) + "\n")
    print("food days: %d · ingredients: %d" % (len(rows), len(ingredients)))


def main():
    cmd, args = (sys.argv[1] if len(sys.argv) > 1 else ""), sys.argv[2:]
    if cmd == "add":
        add(args)
    elif cmd == "table":
        config.chdir_repo()
        table()
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
