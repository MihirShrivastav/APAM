# APAM — Anthropomorphic Procedural Agent Memory for Claude Code

APAM gives Claude Code persistent, structured memory across sessions. Every Claude Code session normally starts blank — no memory of past decisions, architectural context, or user preferences. APAM fixes this.

Claude remembers what was worked on, what was decided, what you prefer, and what patterns emerged — automatically, without you having to brief it every time.

---

## How It Works

APAM stores memory in three layers in a local SQLite database (`~/.apam/<project-id>/apam.db`):

| Layer | Name | What it stores | Lifetime |
|---|---|---|---|
| **L1** | Fast Recall | Preferences, decisions, constraints, commitments | Persistent (evicted only when stale + low-salience) |
| **L2** | Episodes | Session summaries with git context | Permanent, append-only |
| **L3** | Semantic Cards | Consolidated knowledge: architecture, patterns, procedures, modules | Auto-updated every 5 episodes |
| **L4** | Codebase | Your files and git history | Already exists — Claude reads it directly |

At the start of each session, Claude calls `apam_recall` and gets all three layers loaded into context. Before finishing, it calls `apam_write_episode` to log what happened. Every 5 unconsolidated episodes, L2 is automatically distilled into L3 cards.

---

## Architecture

Three components work together:

```
Claude Code Session
│
├── APAM Skill (Superpowers plugin)
│   └── Tells Claude when to recall, pin, and write episodes
│
├── Claude Code Hooks (in ~/.claude/settings.json)
│   ├── PreToolUse → apam-load-context  (reminds Claude to call apam_recall)
│   └── Stop       → apam-write-episode  (fallback episode writer at session end)
│
└── APAM MCP Server  (npx apam-mcp)
    ├── apam_recall        — load L1 + L3 + recent L2 into context
    ├── apam_pin           — write a fact to L1 fast recall
    ├── apam_write_episode — log a session episode to L2
    ├── apam_consolidate   — manually trigger L3 consolidation
    └── apam_status        — memory health snapshot
         │
         └── SQLite: ~/.apam/<project-id>/apam.db
```

---

## Prerequisites

- Node.js 18+
- Claude Code CLI or desktop app
- [Superpowers plugin](https://github.com/anthropics/claude-code) for the APAM skill

---

## Installation

### 1. Clone the repo and build

```bash
git clone https://github.com/MihirShrivastav/APAM.git
cd APAM/packages/apam-mcp
npm install
npm run build
```

### 2. Link the CLI globally

```bash
npm link
```

This makes the `apam`, `apam-mcp`, `apam-load-context`, and `apam-write-episode` binaries available on your PATH.

### 3. Register the MCP server with Claude Code

Add the server to your Claude Code MCP config. The config file lives at:
- **Mac/Linux:** `~/.claude/claude_desktop_config.json`
- **Windows:** `%USERPROFILE%\.claude\claude_desktop_config.json`

For the **desktop app**:

```json
{
  "mcpServers": {
    "apam": {
      "command": "apam-mcp"
    }
  }
}
```

For the **CLI** (`~/.claude/settings.json` on Mac/Linux, `%USERPROFILE%\.claude\settings.json` on Windows):

```json
{
  "mcpServers": {
    "apam": {
      "command": "apam-mcp"
    }
  }
}
```

If you skipped `npm link`, use the full path to the built binary instead:

```json
{
  "mcpServers": {
    "apam": {
      "command": "node",
      "args": ["/path/to/APAM/packages/apam-mcp/dist/server.js"]
    }
  }
}
```

### 3. Install the APAM skill plugin

The skill ships as a Claude Code plugin. Register the plugin directory as a marketplace, then install from it:

```bash
# From the APAM repo root — register as a local marketplace (run once)
claude plugin marketplace add /path/to/APAM/packages/apam-skill

# Then install the plugin
claude plugin install apam@apam
```

Replace `/path/to/APAM` with the actual path where you cloned the repo.

To verify it installed:

```bash
claude plugin list
# apam should appear in the output
```

> **Note:** The marketplace registration points at your cloned directory. If you move the repo, re-run `claude plugin marketplace add` with the new path.

### 4. Initialise for your project

Run this once from inside your project directory:

```bash
apam init
```

This will:
- Derive a project ID from your git remote URL (or directory path)
- Create the SQLite database at `~/.apam/<project-id>/apam.db`
- Write the two hook entries into `~/.claude/settings.json` automatically

After running `apam init`, restart Claude Code for the hooks to take effect.

---

## Verification

Check that everything is wired up correctly:

```bash
# From your project directory
apam status
```

Expected output:
```
## APAM Memory Status
Project: a1b2c3d4e5f6a7b8
L1 atoms (global + project): 0
L2 episodes: 0 total, 0 unconsolidated
L3 cards: 0
Next consolidation at: 5 unconsolidated episodes (5 more needed)
Last session: none
```

If you see this, APAM is working. Start a Claude Code session in your project — Claude will call `apam_recall` at the start (loaded via the skill) and `apam_write_episode` before finishing.

---

## CLI Reference

```bash
apam init              # Initialise project, create DB, configure hooks
apam status            # Show memory counts and next consolidation threshold
apam consolidate       # Manually trigger L3 consolidation now
apam forget <card-id>  # Delete an L3 card by its ID
```

---

## MCP Tools Reference

These are called by Claude automatically (via the skill). You can also call them manually in a Claude session.

| Tool | Purpose | Key inputs |
|---|---|---|
| `apam_recall` | Load all memory for a project | `project_id` |
| `apam_pin` | Store a fact in L1 fast recall | `type`, `content`, `scope`, `confidence` |
| `apam_write_episode` | Log a session to L2 | `project_id`, `summary`, `decisions`, `files_touched`, … |
| `apam_consolidate` | Distill L2 episodes into L3 cards | `project_id` |
| `apam_status` | Memory health snapshot | `project_id` (optional) |

### apam_pin types and scopes

**Types**: `preference` · `decision` · `constraint` · `commitment`

**Scope**:
- `global` — applies to all projects (e.g. "prefer concise responses", "use tabs")
- `project` — applies only to this repo (e.g. "use PostgreSQL", "no mocks in tests")

**Confidence**:
- `user_confirmed` — user stated it explicitly (salience: 0.9)
- `claude_inferred` — Claude observed a strong pattern (salience: 0.7)

---

## Memory Lifecycle

```
Session N starts
  └── apam_recall called
      └── Returns: L1 atoms + L3 cards + last 2 episodes

During session
  └── apam_pin called for high-salience facts

Session N ends
  └── apam_write_episode called
      └── If unconsolidated episodes >= 5:
          └── apam_consolidate runs automatically
              └── L2 episodes → L3 cards (decisions, patterns, problems, modules)
```

---

## L3 Consolidation

Every 5 unconsolidated episodes, APAM runs the consolidation job. It reads all pending episodes and produces or updates L3 cards:

| Card type | Source | Title |
|---|---|---|
| `architecture` | `decisions[]` from episodes | "Key Decisions" |
| `pattern` | `patterns_observed[]` from episodes | "Observed Patterns" |
| `procedural` | `problems_solved[]` from episodes | "Problems Solved" |
| `entity` | Files touched ≥ 2 episodes | "Module: \<dir\>" |

Cards are upserted, not replaced — content from prior runs is preserved and new content is appended. Each card tracks which episodes it was derived from (`source_episode_ids`).

You can also trigger consolidation manually:

```bash
apam consolidate
```

---

## Data Storage

All data is stored locally. Nothing leaves your machine.

```
~/.apam/
└── <project-id>/      # 16-char hex derived from git remote URL
    └── apam.db        # SQLite database (WAL mode)
```

`~` is `$HOME` on Mac/Linux (`/Users/<you>` on Mac, `/home/<you>` on Linux) and `%USERPROFILE%` on Windows (`C:\Users\<you>`).

Project ID derivation:
1. SHA256 of the normalized git remote URL (strips protocol, `.git`, trailing slash) → first 16 hex chars
2. Falls back to SHA256 of the absolute directory path if no git remote exists

---

## Hooks Behaviour

After `apam init`, two hooks are added to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": ".*",
      "hooks": [{ "type": "command", "command": "apam-load-context" }]
    }],
    "Stop": [{
      "hooks": [{ "type": "command", "command": "apam-write-episode" }]
    }]
  }
}
```

- **`apam-load-context`** fires before every tool call. If the project DB exists, it outputs a JSON message reminding Claude to call `apam_recall`. Always exits 0 — never blocks a session.
- **`apam-write-episode`** fires when Claude finishes responding. If Claude already wrote an episode in the last 10 minutes (via `apam_write_episode`), this is a no-op. Otherwise it writes a minimal fallback episode with git context. Always exits 0.

---

## Development

```bash
cd packages/apam-mcp
npm install
npm test          # run all tests (vitest)
npm run build     # compile TypeScript to dist/
```

Tests: 30 tests across 9 files, all in-memory SQLite (no disk I/O needed).

---

## Design

See the full design spec: [docs/superpowers/specs/2026-04-03-apam-claude-code-design.md](docs/superpowers/specs/2026-04-03-apam-claude-code-design.md)
