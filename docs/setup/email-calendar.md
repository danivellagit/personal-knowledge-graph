# Connect email, calendar and meeting transcripts

**Optional.** About 5-15 minutes per service. Nothing to install in this repo: these sources are read through
your **agent runner's connectors** (MCP servers), so the login stays with the runner and never in the repo.

What they add: the work side of a brief (when you last met someone, what you left open), the cadence of your
relationships, and the founder assistant's view of your day. **Read-only by default**: the graph only reads mail
and calendar. An agent sends a mail or accepts an invite only when you ask for that specific action.

## Claude Code

Claude Code talks to external services through MCP servers. Add one per service with `claude mcp add` (see
`claude mcp --help` and the Claude Code docs on MCP for the current flags; `--scope user` makes it available in
every project, the default scope is this project only), then log in to the service the way that server asks.
Pick a Gmail / Google Calendar (or Outlook, or your provider's) MCP server you trust, and grant it the narrowest
scopes it offers: read-only mail, read-only calendar. Check what is connected with `claude mcp list`.

## Grok Bot (or another always-on runner)

Connect Gmail, Google Calendar, Outlook or a transcript service (e.g. Fireflies) from the runner's connector
settings. Your bots then read them in every session and every routine. Same rule: read-only unless you ask.

## Cursor, Codex and other runners

The same idea: add the MCP server in the runner's MCP settings. The repo does not care which runner reads the
source, only that one does.

## Tell the graph what is wired

In `config.local.yml`:

```yaml
integrations:
  calendar: gcal          # whatever you connected; leave out what you do not have
  mail: gmail             # person-to-person mail only (newsletters, receipts, OTPs are skipped)
  transcripts: fireflies  # meetings auto-logged by the sweep
```

The daily sweep (`skills/remember-people`) then reads them; with none of them, it works from what you tell it.

## Privacy

Mail and calendars carry other people's details. Everything read lands in `data/` (private), behind the wall
(`CLAUDE.md`, section 9): nothing personal goes to a work repo or a shared surface. Prompt injection is real: an
agent that reads untrusted mail and can also send data out can be steered by a crafted message, which is one more
reason to keep sending off unless you ask for it.

Related: [`config.example.yml`](../../config.example.yml), [`INSTALL.md`](../../INSTALL.md).
