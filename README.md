<div align="center">

# LIQAA MCP Server

**Let AI agents start video calls and verify webhooks via the [Model Context Protocol](https://modelcontextprotocol.io).**

[![mcp version](https://img.shields.io/badge/MCP-1.0-1d4ed8?style=flat-square)](https://modelcontextprotocol.io)
[![npm](https://img.shields.io/npm/v/@liqaa/mcp.svg?style=flat-square&color=10b981)](https://www.npmjs.com/package/@liqaa/mcp)
[![license](https://img.shields.io/badge/license-MIT-475569?style=flat-square)](./LICENSE)

[Website](https://liqaa.io) · [Docs](https://liqaa.io/docs) · [MCP spec](https://modelcontextprotocol.io)

</div>

---

## What is this?

The **Model Context Protocol** lets AI assistants (Claude Desktop, Cursor, Continue, etc.) call external services in a standardized way. This server exposes the LIQAA Public API as MCP tools, so an agent can:

> "Set up a video call between alice@example.com and bob@example.com for 3pm tomorrow."

…and the agent will actually create the room, return the join URLs, and (if you wired webhooks) wait for `call.started` events.

## Tools exposed

| Tool                          | Description                                                      |
| ----------------------------- | ---------------------------------------------------------------- |
| `liqaa_create_room`           | Create or reuse a persistent room between two users.             |
| `liqaa_get_room`              | Look up the state of a room by `external_conversation_id`.       |
| `liqaa_end_room`              | End an active call.                                              |
| `liqaa_issue_sdk_token`       | Issue a 1-hour browser-safe JWT for a given identity.            |
| `liqaa_list_webhooks`         | Inspect your webhook subscriptions.                              |
| `liqaa_create_webhook`        | Subscribe to events (returns one-time signing secret).           |

## Resources exposed

| URI                                | Returns                                                           |
| ---------------------------------- | ----------------------------------------------------------------- |
| `liqaa://docs/quickstart`          | Quickstart guide as markdown.                                     |
| `liqaa://docs/api`                 | OpenAPI 3.1 spec (live).                                          |
| `liqaa://docs/security`            | Security policy.                                                  |
| `liqaa://status`                   | Live status of LIQAA Cloud (uptime, latency).                     |

## Install

### Claude Desktop / Claude Code

Add to your `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "liqaa": {
      "command": "npx",
      "args": ["-y", "@liqaa/mcp"],
      "env": {
        "LIQAA_PK": "pk_live_…",
        "LIQAA_SK": "sk_live_…"
      }
    }
  }
}
```

### Cursor

Settings → MCP → Add new server:

```json
{
  "name": "liqaa",
  "command": "npx -y @liqaa/mcp",
  "env": { "LIQAA_PK": "...", "LIQAA_SK": "..." }
}
```

### Standalone (any MCP host)

```bash
npx @liqaa/mcp
# or
npm install -g @liqaa/mcp && liqaa-mcp
```

## Example agent prompts

Once connected, just ask in natural language:

- "Start a video meeting with sarah@acme.com about ticket-1284."
- "What's our LIQAA uptime over the last 30 days?"
- "Subscribe https://my-app.com/hooks/liqaa to call.started and call.ended events."
- "End the active call with the room name room-abc123."

## How it works

```
┌────────────┐  MCP (stdio/JSON-RPC)  ┌───────────┐  HTTPS+JWT  ┌────────────┐
│ AI agent   │ ──────────────────────▶│ liqaa-mcp │ ───────────▶│ LIQAA API  │
│ (Claude…)  │ ◀──────────────────────│  server   │ ◀───────────│            │
└────────────┘                        └───────────┘             └────────────┘
```

The agent invokes a tool → MCP server translates to a REST call → response flows back as structured content.

## Security

The MCP server is run **locally** by the host (Claude Desktop, Cursor). Your `sk_live_*` never leaves your machine. The server refuses tools that would leak the secret key.

## License

[MIT](./LICENSE) © TKAWEN — LIQAA Cloud.
