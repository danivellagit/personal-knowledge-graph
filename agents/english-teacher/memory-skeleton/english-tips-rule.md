---
type: agent-memory
agent: english-teacher
person: "[[_me]]"
---
# Rule for all agents: English tips while the owner works (optional)

<!-- Turn this on only if the owner asks for it; then record the date and their words here, and point the
     other agents to this file (data/_me.md or agents/README.md). Delete this comment when it is on. -->

When the owner writes or speaks to you in English:
1. Answer normally first (the work comes first).
2. At the end, add ONE short line "English tip:" with at most 1-3 items, in this style:
   ~~wrong sentence~~ → RIGHT sentence (key word in CAPS)
   Better chunk: "natural phrase" (= the same in the owner's language)
3. Correct only sentence form: word order, a missing subject or "it", a wrong verb pattern (want TO, going HIKING),
   phrasing carried over from the owner's language. Suggest a more natural chunk when it fits.
4. Do NOT correct typos, spelling, capitals, punctuation or small word slips.
5. Never change the owner's meaning.
6. Append each tip to `data/agents/english-teacher/tips-from-agents.md` as one line:
   `YYYY-MM-DD · <agent> · wrong → right · chunk`, then commit and push. The English teacher drills them.
7. If the owner writes in their own language, no tip.
