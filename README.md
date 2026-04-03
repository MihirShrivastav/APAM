# APAM — Anthropomorphic Procedural Agent Memory for Claude Code

APAM gives Claude Code persistent, structured, self-maintaining memory across sessions.
No more blank-slate starts. Claude remembers your preferences, past decisions, architectural
context, and what was worked on — automatically.

---

## The Problem

Every Claude Code session starts from zero. Claude has no memory of:
- How you like to work (preferences, style, tools)
- Architectural decisions made in previous sessions
- What bugs were fixed and how
- What the codebase does at a higher level

You end up re-explaining the project every session.

## The Solution

APAM implements a layered memory architecture inspired by how human memory works:

| Layer | What it holds | Updated by |
|-------|--------------|------------|
| **L1 Fast Recall** | Preferences, decisions, constraints, commitments | Claude (mid-session) or you explicitly |
| **L2 Episodes** | Session logs with git context — what was done, decided, fixed | Automatic on session end |
| **L3 Semantic Cards** | Consolidated knowledge: architecture, patterns, procedures | Automatic every 5 episodes |
| **L4** | Your codebase + git history | Already exists — Claude reads directly |

---

## Install

```bash
# 1. Start the MCP server (runs persistently)
npx apam-mcp

# 2. Register with Claude Code — add to ~/.claude/claude_desktop_config.json
{
  "mcpServers": {
    "apam": {
      "command": "npx",
      "args": ["apam-mcp"]
    }
  }
}

# 3. Install the APAM Superpowers skill plugin
# Copy packages/apam-skill/skill.md to your Superpowers skills directory

# 4. Initialise APAM for your project (run from the project root)
npx apam init
```

`apam init` configures the Claude Code session hooks automatically — no manual setup needed.

---

## How It Works

### Session start
The APAM skill tells Claude to call `apam_recall` first thing. Claude receives a structured
context block containing all L1 facts, all L3 knowledge cards, and the last 2 session
summaries. No files need to be read to understand the project.

### During the session
When Claude learns something worth remembering across sessions — a confirmed preference,
an architectural decision, a constraint — it calls `apam_pin` to store it in L1.

### Session end
Before finishing, Claude calls `apam_write_episode` with a summary of what was accomplished,
decisions made, problems solved, and patterns observed. A Stop hook provides a git-based
fallback episode if Claude doesn't write one explicitly.

### Consolidation
After every 5 new episodes, APAM automatically distils them into L3 semantic cards.
Decisions become architecture cards. Patterns become pattern cards. Problems solved become
procedural cards. Frequently touched modules become entity cards.

---

## CLI

```bash
apam init          # Initialise project + configure Claude Code hooks
apam status        # Memory health snapshot (atom counts, last consolidation)
apam consolidate   # Manually trigger L3 consolidation
apam forget <id>   # Remove an L3 card by ID (then re-consolidate to rebuild)
```

---

## MCP Tools

Five tools exposed to Claude Code via MCP:

| Tool | Purpose |
|------|---------|
| `apam_recall` | Load L1 + L3 + recent episodes at session start |
| `apam_pin` | Store a high-salience fact into L1 |
| `apam_write_episode` | Record a session into L2 |
| `apam_consolidate` | Distil L2 episodes into L3 cards |
| `apam_status` | Memory health snapshot |

---

## Storage

One SQLite database per project, stored at `~/.apam/<project-id>/apam.db`.
Project ID is derived from the git remote URL (or directory path for local-only repos).
No cloud, no sync, no accounts. Fully local.

---

## Architecture

```
Claude Code Session
  ├── APAM Skill (cognitive policy — when to recall, pin, write episodes)
  └── Claude Code Hooks (session-start load, session-end write)
          │
          │ MCP Protocol
          ▼
  APAM MCP Server (TypeScript + SQLite)
    ├── L1: Fast Recall (key/value, instant lookup)
    ├── L2: Episodes (append-only session log)
    └── L3: Semantic Cards (consolidated knowledge)
          │
          ▼
  L4: Your codebase + git history (Claude reads directly)
```

Full design: [docs/superpowers/specs/2026-04-03-apam-claude-code-design.md](docs/superpowers/specs/2026-04-03-apam-claude-code-design.md)

---

## Development

```bash
cd packages/apam-mcp
npm install
npm test          # run all tests
npm run build     # compile to dist/
```

See [docs/superpowers/plans/2026-04-03-apam-claude-code.md](docs/superpowers/plans/2026-04-03-apam-claude-code.md)
for the full 13-task implementation plan.

---

## Roadmap

**v1.0 — Claude Code** (current)
- MCP server with SQLite backend
- Five MCP tools
- Superpowers skill plugin
- Claude Code hooks for session automation

**v1.1 — Multi-agent**
- Cursor adapter (`.cursorrules`)
- Windsurf adapter (`.windsurfrules`)
- Gemini CLI adapter (`GEMINI.md`)
- Universal `APAM.md` instruction format

---

## License

MIT
