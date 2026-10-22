---
# EVERY wiki-link below is QUOTED, and that is not cosmetic. Unquoted, YAML reads `[[x]]` as
# nested arrays: Obsidian registers no reference and graph.py finds no link, so the file becomes
# an orphan in the graph. An unquoted template gets copied by every sweep: in the graph this
# engine was built on, 687 of 705 interactions sat disconnected for a month because of it.
# Keep the quotes. `tools/lint.py` checks this file too.
person: "[[tessa-marlowe]]"      # the anchor. MUST match the interactions/<slug>/ folder it lives in
date: 2026-07-05
setting: in-person               # in-person | lunch | dinner | meeting | event | call | chat | manual
source: fireflies:<id>           # whatsapp:<phone> | gmail:<thread> | manual:<owner>-<date>
time: "18:30-18:41"              # when it happened, LOCAL time, only when known (transcript start +
                                 # duration, a calendar slot, "see you at 9"). Lets tools/body.py put
                                 # the heart next to the moment. Unknown -> leave it out, never guess
body: "[[body-2026-07-05]]"      # OPTIONAL, only if you run the body layer: that day's body node
with:                            # everyone else who was there. Drives the co-presence check (Flow E)
  - "[[jonah-whitlock]]"
at: "[[copper-kettle]]"          # a PLACE (a venue). Never a city, never a passion
city: "[[lisbon]]"               # the city it happened in
about:                           # passions / terms discussed
  - "[[sailing]]"
  - "[[north-star-metric]]"
---

## Work
- What you discussed on the professional side.

## Personal
<!-- THE MOST IMPORTANT SECTION. Capture aggressively and specifically, even from a "work" call
     or a quick message: life stories, background, family, health, feelings, fears, ambitions,
     character, jokes, what they are going through. Capture proper NAMES: partner/spouse (name,
     job, state of the relationship, plans together), children (names, ages), parents/siblings,
     close friends and who introduced whom, investors / people who funded them. Quote real words.
     If this section is empty (or generic) after a real human exchange, you under-captured. -->
- What you learned about them: events, family, mood, news.
  (e.g. "Theo started football", "moving to Porto next month")
- Who introduced them, if this is the first time they appear: stated once, never repeated.

## Follow-ups
- [ ] What you promised / what you owe them.

## Next time
- Hooks to open with. What to ask them.
