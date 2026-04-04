# APAM — Anthropomorphic Procedural Agent Memory for Claude Code

APAM gives Claude Code persistent, structured memory across sessions. Every Claude Code session normally starts blank — no memory of past decisions, architectural context, or user preferences. APAM fixes this.

Claude remembers what was worked on, what was decided, what you prefer, and what patterns emerged — automatically, without you having to brief it every time.

---

## How It Works

APAM stores memory in three layers in a local SQLite database (`~/.apam/<project-id>/apam.db`):

| Layer | Name | What it stores | Lifetime |
|---|---|---|---|
| **L1** | Fast Recall | User preferences + project index: stack, endpoints, folder structure, constraints | Persistent (evicted only when stale + low-salience) |
| **L2** | Episodes | Session logs: what was done, decisions made, files changed, plan/doc pointers | Permanent, append-only |
| **L3** | Project Intelligence | Architecture, patterns, procedures, modules, future plans, enhancement ideas | Written immediately as knowledge is produced; also auto-updated from episodes |
| **L4** | Codebase | Your files and git history | Already exists — Claude reads it directly |

At the start of each session, Claude calls `apam_recall` to load all three layers into context. As the session progresses, Claude writes to L1, L2, and L3 proactively — not just at the end.

---

## Architecture

Three components work together:

```
Claude Code Session
│
├── APAM Skill (Superpowers plugin)
│   └── Tells Claude when to recall, pin, update intelligence, and write episodes
│
├── Claude Code Hooks (in ~/.claude/settings.json)
│   ├── PreToolUse → apam-load-context   (reminds Claude to call apam_recall)
│   └── Stop       → apam-write-episode  (fallback episode writer at session end)
│
└── APAM MCP Server  (apam-mcp)
    ├── apam_recall               — load L1 + Project Intelligence + recent L2
    ├── apam_pin                  — write a fact to L1 fast recall
    ├── apam_update_intelligence  — write directly to Project Intelligence (L3)
    ├── apam_write_episode        — log a session episode to L2
    ├── apam_consolidate          — distill L2 episodes into Project Intelligence
    └── apam_status               — memory health snapshot
         │
         └── SQLite: ~/.apam/<project-id>/apam.db
```

---

## Prerequisites

- Node.js 18+
- Claude Code CLI or desktop app
- Superpowers plugin (for the APAM skill)

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

The config file location:
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

### 4. Install the APAM skill plugin

The skill ships as a Claude Code plugin. Register the plugin directory as a local marketplace, then install:

```bash
# From the APAM repo root — register once
claude plugin marketplace add /path/to/APAM/packages/apam-skill

# Install the plugin
claude plugin install apam@apam
```

Replace `/path/to/APAM` with the actual path where you cloned the repo.

Verify it installed:

```bash
claude plugin list
# apam should appear in the output
```

> **Note:** The marketplace registration points at your cloned directory. If you move the repo, re-run `claude plugin marketplace add` with the new path.

### 5. Initialise for your project

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

Start a Claude Code session — the skill will instruct Claude to call `apam_recall` immediately and begin populating memory as the session progresses.

---

## CLI Reference

```bash
apam init              # Initialise project, create DB, configure hooks
apam status            # Show memory counts and consolidation status
apam consolidate       # Manually trigger Project Intelligence consolidation
apam forget <card-id>  # Delete a Project Intelligence record by ID
```

---

## MCP Tools Reference

Called by Claude automatically via the skill. You can also invoke them manually in a Claude session.

| Tool | Purpose | Key inputs |
|---|---|---|
| `apam_recall` | Load all memory for a project at session start | `project_id` |
| `apam_pin` | Write a fact to L1 fast recall | `type`, `content`, `scope`, `confidence` |
| `apam_update_intelligence` | Write directly to Project Intelligence | `project_id`, `type`, `title`, `content` |
| `apam_write_episode` | Log a unit of work to L2 | `project_id`, `summary`, `decisions`, `files_touched`, … |
| `apam_consolidate` | Distill L2 episodes into Project Intelligence | `project_id` |
| `apam_status` | Memory health snapshot | `project_id` (optional) |

### apam_pin — types and scopes

**Types**: `preference` · `decision` · `constraint` · `commitment`

**Scope**:
- `global` — applies to all projects (e.g. "prefer concise responses", "use tabs")
- `project` — applies only to this repo (e.g. "use PostgreSQL", "no mocks in tests")

**Confidence**:
- `user_confirmed` — user stated it explicitly (salience: 0.9)
- `claude_inferred` — Claude observed a strong pattern (salience: 0.7)

### apam_update_intelligence — types

| Type | Use for |
|---|---|
| `architecture` | System design, key decisions, why things are built the way they are; also future plans |
| `entity` | What exists: APIs, endpoints, schemas, key modules — orientation-level, not full specs |
| `procedural` | How-to knowledge: running tests, deployment, local setup |
| `pattern` | Recurring conventions, error handling approaches, naming rules |

---

## What Claude Stores in L1

L1 is a **project index**, not just a preferences store. Claude pins:

**Global (all projects)**
- User preferences and communication style
- Workflow preferences ("always run tests before committing")

**Project-specific**
- What the project is and what problem it solves
- Tech stack: languages, frameworks, key libraries
- Folder structure: where is src, tests, config
- Entry points: main file, CLI, server start command
- APIs and endpoints: names and one-line purpose each
- Databases and data models: what DB, what main schemas
- Key external services or integrations
- Active constraints ("never expose X", "always go through Y")

---

## Memory Lifecycle

```
Session starts
  └── apam_recall → loads L1 (fast recall) + Project Intelligence + last 2 episodes

New project detected
  └── Claude explores codebase / asks user
      └── Immediately pins project facts to L1
          └── Writes initial Project Intelligence records

During session (as knowledge is produced)
  ├── apam_pin         — new fact learned about project or user preference
  ├── apam_update_intelligence — architecture discussed, API designed, plan created
  └── apam_write_episode — meaningful chunk of work completed (can happen multiple times)

Session ends
  └── Any pending Project Intelligence + final episode written

Every 5 unconsolidated episodes (automatic)
  └── apam_consolidate → decisions/patterns/problems from episodes → Project Intelligence
```

---

## Project Intelligence

Project Intelligence (L3) is the durable knowledge layer — written directly by Claude as knowledge is produced, not just distilled from episodes. Claude calls `apam_update_intelligence` in the same response where architectural decisions are made, not deferred to session end.

Records are **upserted by title** — "API Endpoints" always updates the same record. Content from prior writes is preserved and appended.

**Periodic consolidation** (every 5 episodes) also writes to Project Intelligence automatically:

| Record | Source | Title |
|---|---|---|
| `architecture` | `decisions[]` from episodes | "Key Decisions" |
| `pattern` | `patterns_observed[]` from episodes | "Observed Patterns" |
| `procedural` | `problems_solved[]` from episodes | "Problems Solved" |
| `entity` | Files touched ≥ 2 episodes | "Module: \<dir\>" |

Trigger consolidation manually at any time:

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
- **`apam-write-episode`** fires when Claude finishes responding. If Claude already wrote an episode in the last 10 minutes, this is a no-op. Otherwise it writes a minimal fallback episode with git context. Always exits 0.

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
