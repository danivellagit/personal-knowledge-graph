# Connect WhatsApp

WhatsApp is the richest source for a personal graph: it carries the relationships your calendar
and email never see. This graph reads it through the **WhatsApp MCP server** by lharries, an
open-source bridge. We reference it, we do not vendor it, so you always get the upstream version.

Repo: https://github.com/lharries/whatsapp-mcp

## How it works

A small Go bridge logs into WhatsApp Web via QR code (using the whatsmeow library) and stores
your messages in a **local SQLite database**. A Python MCP server exposes them to Claude as
tools (read / search chats and contacts, send messages). Nothing leaves your machine until the
agent reads it through a tool you control.

> Caution: like most MCP servers, this is subject to the "lethal trifecta". An agent with
> access to your private messages, untrusted content, and a way to send data out can be steered
> by prompt injection. Keep the graph private and be deliberate about what you connect.

## Steps

**Prerequisites:** Go, Python 3.6+, and UV (`curl -LsSf https://astral.sh/uv/install.sh | sh`).
FFmpeg is optional (only for sending audio as playable voice messages).

1. **Clone the bridge** somewhere next to this repo:

   ```bash
   git clone https://github.com/lharries/whatsapp-mcp.git
   cd whatsapp-mcp
   ```

2. **Run the bridge and scan the QR code:**

   ```bash
   cd whatsapp-bridge
   go run main.go
   ```

   Scan the QR with your phone (WhatsApp > Linked devices). You may need to re-authenticate
   roughly every 20 days.

3. **Register the MCP server with your agent.** For Claude, add this to your MCP config
   (`~/Library/Application Support/Claude/claude_desktop_config.json` for the desktop app, or
   your Claude Code MCP config). Replace the two paths:

   ```json
   {
     "mcpServers": {
       "whatsapp": {
         "command": "{{PATH_TO_UV}}",
         "args": [
           "--directory",
           "{{PATH_TO}}/whatsapp-mcp/whatsapp-mcp-server",
           "run",
           "main.py"
         ]
       }
     }
   }
   ```

   `{{PATH_TO_UV}}` is the output of `which uv`. `{{PATH_TO}}` is where you cloned the repo.

4. **Point this graph at it.** In your `config.local.yml`:

   ```yaml
   integrations:
     whatsapp: whatsapp-mcp
   ```

5. **Let the backfill detector find the store.** The bridge keeps every message in
   `whatsapp-bridge/store/messages.db`. `tools/owed_backfill.py` reads it to measure which days
   with real traffic still have no log, so point `backfill.whatsapp_db` in `config.local.yml`
   at that file. The bridge only holds what it has synced since you linked it; if your WhatsApp
   desktop app keeps a longer history, you can add its store as `backfill.whatsapp_desktop_db`.

Once connected, the `remember-people` daily sweep reads your real conversations, attributes
group messages to their sender, and feeds them into each person's node. See the full sweep
rules in [`skills/remember-people/SKILL.md`](skills/remember-people/SKILL.md).

For anything else (media, re-auth, troubleshooting), follow the upstream README:
https://github.com/lharries/whatsapp-mcp
