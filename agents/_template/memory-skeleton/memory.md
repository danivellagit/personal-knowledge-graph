---
type: agent-memory
agent: {{ROLE}}
persona: "{{AGENT_NAME}}"
person: "[[_me]]"
created: {{CREATED}}
---
# {{AGENT_NAME}} ({{ROLE_TITLE}}): memory

<!-- Read at the start of every conversation, updated at the end. The owner's words as quotes, dated; the
     agent's reads marked (read). Anything saved in the runner's memory is also written here, same turn
     (agents/README.md, rule 7). Shared facts go to data/_me.md and the graph nodes, not here. -->

## Why {{AGENT_FIRST_NAME}} is like this (the owner's words; the persona is the read)
<!-- Why this persona, and every correction the owner made to it. -->

## Agreements
<!-- What the owner decided, dated, their words. -->

## Open
<!-- Pending items, each with 'closed when ...'. -->

## Log
<!-- YYYY-MM-DD: one line per conversation that changed something. -->
