"""Tests for tools/food.py meal parsing.  Run: python3 -m unittest discover -s tools/tests  (from the repo root)

`food.py table` skipped meals whose heading time starts with "~" (approximate time), and a
"~10:00–13:15" span; their Nutrients line was swallowed by the previous meal, so day totals were too low."""
import os, shutil, sys, tempfile, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import food  # noqa: E402

DAY = """---
type: food-day
person: "[[_me]]"
date: 2026-01-02
meals:
kcal_est:
protein_g_est:
carbs_g_est:
fat_g_est:
---

# Friday 2 January 2026 — food

## 08:00 · breakfast
- **Ingredients:** milk, coffee
- **Nutrients:** energy 100 kcal · protein 10 g · carbs 10 g · fat 1 g

## ~10:00–13:15 · drinks (during a workout)
- **Ingredients:** sports drink
- **Nutrients:** energy 250 kcal · protein 0 g · carbs 59 g · fat 0 g

## ~14:50 · snack
- **Ingredients:** yogurt
- **Nutrients:** energy 150 kcal · protein 20 g · carbs 10 g · fat 3 g

## ~ 19:30 · not a meal heading (space after the tilde)
"""


class MealParsing(unittest.TestCase):
    def test_headings_with_tilde_and_span_count(self):
        self.assertEqual(food.MEAL_H.findall(DAY), ["08:00", "10:00", "14:50"])

    def test_each_meal_keeps_its_own_nutrients(self):
        m = food.meal_nutrients(DAY)
        self.assertEqual([x["energy_kcal"] for x in m], [100, 250, 150])
        self.assertEqual(sum(x["protein_g"] for x in m), 30)

    def test_table_totals_include_approximate_meals(self):
        tmp = tempfile.mkdtemp()
        old = food.OUT
        try:
            food.OUT = tmp
            p = os.path.join(tmp, "food-2026-01-02.md")
            open(p, "w", encoding="utf8").write(DAY)
            cwd = os.getcwd()
            food.table()
            out = open(p, encoding="utf8").read()
            self.assertIn("meals: 3\n", out)
            self.assertIn("kcal_est: 500\n", out)
            self.assertIn("protein_g_est: 30\n", out)
            log = open(os.path.join(tmp, "food-log.md"), encoding="utf8").read()
            self.assertIn("| 3 | 3 | 500 | 30 |", log)
            self.assertEqual(os.getcwd(), cwd)
        finally:
            food.OUT = old
            shutil.rmtree(tmp)


if __name__ == "__main__":
    unittest.main()
