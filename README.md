# APAM — Anthropomorphic Procedural Agent Memory for Claude Code

APAM gives Claude Code persistent, structured memory across sessions. Every Claude Code session normally starts blank — no memory of past decisions, architectural context, or user preferences. APAM fixes this.

Claude remembers what was worked on, what was decided, what you prefer, and what patterns emerged — across every session, without you briefing it each time.

---

## How It Works

APAM stores memory in three layers in a local SQLite database (`~/.apam/<project-id>/apam.db`):

| Layer | Name | What it stores | Lifetime |
|---|---|---|---|
| **L1** | Fast Recall | User preferences + project index: stack, endpoints, folder structure, constraints | Persistent (evicted only when stale + low-salience) |
| **L2** | Episodes | Session logs: what was done, decisions made, files changed, plan/doc pointers | Permanent, append-only |
| **L3** | Project Intelligence | Architecture, patterns, procedures, modules, future plans, enhancement ideas | Written immediately as knowledge is produced; also auto-distilled from episodes |

At the start of each session, Claude calls `apam_recall` to load all three layers into context. As work progresses, Claude writes to L1, L2, and L3 proactively — not just at the end.

---

## Quick Start

```bash
# 1. Clone and build
git clone https://github.com/MihirShrivastav/APAM.git
cd APAM/packages/apam-mcp && npm install && npm run build && npm link

# 2. Register MCP server (add to ~/.claude/settings.json)
# See Installation section for the JSON

# 3. Install the skill plugin
claude plugin marketplace add /path/to/APAM/packages/apam-skill
claude plugin install apam@apam

# 4. Initialise for your project (run from inside the project)
apam init
```

Then in Claude Code:
- Start any session: `/apam:apam-fetch`
- First session in a new project: `/apam:apam-init`
- After building something: `/apam:apam-update`

---

## Slash Commands

Once the plugin is installed, five commands are available in Claude Code. [Full reference below.](#slash-commands-1)

| Command | When to use |
|---|---|
| `/apam:apam-fetch` | **Start of any session** — loads all memory, Claude knows the project |
| `/apam:apam-init` | **First session in a new project** — explores codebase, writes initial memory |
| `/apam:apam-update` | **After meaningful work** — saves what was built, decided, or learned |
| `/apam:apam-consolidate` | **Manual distillation** — extracts L3 records from episode history |
| `/apam:apam` | Full policy reference |

**Typical workflow:**
1. Open a project → `/apam:apam-fetch`
2. Do work
3. `/apam:apam-update`

---

## Architecture

```
Claude Code Session
│
├── APAM Skill (plugin — packages/apam-skill/)
│   ├── /apam:apam-fetch       — load project memory
│   ├── /apam:apam-init        — bootstrap memory for new project
│   ├── /apam:apam-update      — save session work to memory
│   ├── /apam:apam-consolidate — distil episodes into L3
│   └── /apam:apam             — full policy reference
│
├── Claude Code Hooks (written to ~/.claude/settings.json by apam init)
│   ├── PreToolUse → apam-load-context   (reminds Claude to call apam_recall)
│   └── Stop       → apam-write-episode  (fallback episode writer at session end)
│
└── APAM MCP Server  (apam-mcp)
    ├── apam_status               — auto-detects project from cwd, returns project_id
    ├── apam_recall               — load L1 + L3 + recent L2 for a project
    ├── apam_pin                  — write a fact to L1 fast recall
    ├── apam_update_intelligence  — write directly to L3 Project Intelligence
    ├── apam_write_episode        — log a session episode to L2
    └── apam_consolidate          — distil L2 episodes into L3
         │
         └── SQLite: ~/.apam/<project-id>/apam.db
```

---

## Prerequisites

- Node.js 18+
- Claude Code CLI or desktop app
- Superpowers plugin installed in Claude Code

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

Add an `mcpServers` entry to your Claude Code settings file:

- **Mac/Linux (CLI):** `~/.claude/settings.json`
- **Windows (CLI):** `%USERPROFILE%\.claude\settings.json`
- **Desktop app:** `~/.claude/claude_desktop_config.json` (Mac/Linux) or `%USERPROFILE%\.claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "apam": {
      "command": "apam-mcp"
    }
  }
}
```

If you skipped `npm link`, use the full path to the built file instead:

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

```bash
# Register the plugin directory as a local marketplace (once)
claude plugin marketplace add /path/to/APAM/packages/apam-skill

# Install the plugin
claude plugin install apam@apam
```

Replace `/path/to/APAM` with the actual path where you cloned the repo.

Verify the install:

```bash
claude plugin list
# apam should appear in the output
```

> **Note:** The marketplace registration points at your local clone. If you move the repo, re-run `claude plugin marketplace add` with the new path and reinstall.

### 5. Initialise for your project

Run this once from inside your project directory:

```bash
apam init
```

This:
- Derives a project ID from your git remote URL (or directory path if no remote)
- Creates the SQLite database at `~/.apam/<project-id>/apam.db`
- Writes the hook entries into `~/.claude/settings.json`

Restart Claude Code after running `apam init` for the hooks to take effect.

---

## Verification

```bash
# From your project directory
apam status
```

Expected output on a fresh project:

```
## APAM Memory Status
Project: a1b2c3d4e5f6a7b8
L1 atoms: 0 project-scoped, 0 global
L2 episodes: 0 total, 0 unconsolidated
L3 Project Intelligence records: 0
L2 auto-consolidation: every 5 episodes (direct L3 writes via apam_update_intelligence are always immediate)
Last session: none
```

Then open Claude Code in the project and run `/apam:apam-init` to bootstrap memory.

---

## Slash Commands

These are how you use APAM day-to-day. Type them directly in a Claude Code session.

---

### `/apam:apam-fetch` — Load memory at session start

**Type this at the beginning of every session.**

Claude will detect the current project, load everything stored about it, and tell you what it knows. After this, Claude has full context: the tech stack, folder structure, past decisions, recent work, and any architectural knowledge recorded in previous sessions.

```
You: /apam:apam-fetch

Claude: Loaded memory for project a1b2c3d4...
  L1 — 5 atoms: Node.js + TypeScript API, PostgreSQL, src/routes + src/models structure,
       entry point src/index.ts, constraint: no raw SQL (use query builder)
  L3 — 4 records: System Overview, API Endpoints, Database Schema, Auth Design
  L2 — last session 3 days ago: implemented user authentication, added JWT middleware
```

If no memory exists yet for the project, Claude will tell you and suggest running `/apam:apam-init`.

---

### `/apam:apam-init` — Bootstrap memory for a new project

**Type this the first time you use APAM in a project.**

Claude will explore the codebase — reading the README, package.json, folder structure, and key source files — and build an initial memory snapshot without you having to explain anything.

What gets written:
- **L1 atoms** for every indexable project fact: what it is, stack, folder structure, entry points, APIs, database, external services, constraints
- **L3 Project Intelligence** records for System Overview and Key Modules, plus anything else that's obvious from the code

At the end Claude reports everything it pinned and invites corrections. If something is wrong, just tell it — it will update the atom.

---

### `/apam:apam-update` — Save what was built or decided

**Type this after any meaningful work: implementing a feature, making a design decision, fixing a non-trivial bug, or having a significant design discussion.**

Claude reviews the conversation, extracts what was learned or decided, and writes it to memory:

- **L1** — any new project facts (new endpoint added, new dependency, new constraint). Also updates existing atoms if something changed — L1 is kept accurate, not just appended to.
- **L3 Project Intelligence** — upserts records for architecture discussed, patterns established, plans made, modules documented. Uses consistent titles so records are updated rather than duplicated.
- **L2 episode** — a structured log of the session: summary, decisions made, files touched, problems solved, patterns observed.

You can run this multiple times in one session if distinct chunks of work were done.

```
You: /apam:apam-update

Claude: Saved:
  L1 — updated "MCP tools" atom (added apam_update_intelligence)
       pinned new atom: "Slash commands: /apam:apam-fetch, /apam:apam-init..."
  L3 — updated "Key Decisions" (v2), updated "MCP Tools" (v2), created "Skill Commands" (v1)
  L2 — episode written: "Fixed apam_status auto-detection, added 4 slash commands, rewrote README"
```

---

### `/apam:apam-consolidate` — Distil episode history into L3

**Type this after several sessions have accumulated, or before starting a new phase of work.**

Claude reads all unconsolidated L2 episodes and extracts durable knowledge into L3 Project Intelligence records: architectural decisions, recurring patterns, problems solved, and modules that keep getting touched. This is a background enrichment step — direct L3 writes from `/apam:apam-update` are always more current.

Check `apam status` to see how many unconsolidated episodes are queued before running this.

---

### `/apam:apam` — Full policy reference

The complete memory policy document: all three layers explained, session protocols, L1 population checklist, memory hygiene rules. Use this when you want to understand or tune how Claude handles memory in detail.

---

## CLI Reference

```bash
apam init              # Initialise project, create DB, write hooks to ~/.claude/settings.json
apam status            # Show memory counts for the current project (auto-detects from cwd)
apam consolidate       # Manually trigger L3 consolidation
apam forget <card-id>  # Delete a Project Intelligence record by ID
```

---

## MCP Tools

These are called by Claude automatically when slash commands run. Listed here for reference — you do not need to invoke them directly.

| Tool | What it does |
|---|---|
| `apam_status` | Returns project_id + memory counts. Call with no arguments — auto-detects from cwd. |
| `apam_recall` | Loads L1 + L3 + last 2 L2 episodes for a project. |
| `apam_pin` | Writes or updates an L1 fast recall atom. |
| `apam_update_intelligence` | Upserts an L3 Project Intelligence record by title. |
| `apam_write_episode` | Appends an L2 session episode. |
| `apam_consolidate` | Distils unconsolidated L2 episodes into L3. |

---

## What Claude Stores in L1

L1 is a **project index**, not just a preferences store.

**Global (all projects)**
- User preferences and communication style
- Workflow preferences ("always run tests before committing", "use tabs")

**Project-specific**
- What the project is and what problem it solves
- Tech stack: languages, frameworks, key libraries
- Folder structure: where src, tests, and config live
- Entry points: main file, CLI, server start command
- APIs and endpoints: names and one-line purpose
- Database and data models: what DB, what main schemas
- Key external services or integrations
- Active constraints ("never expose X", "always go through Y")

---

## Memory Lifecycle

```
Session starts
  └── /apam:apam-fetch → apam_recall → loads L1 + L3 + last 2 episodes

New project, no memory
  └── /apam:apam-init
      ├── Explores codebase (README, package.json, folder structure)
      ├── Pins project facts to L1 (stack, structure, endpoints, constraints)
      └── Writes initial L3 Project Intelligence (System Overview, Key Modules)

During session (as knowledge is produced)
  ├── apam_pin                 — new fact about project or user preference
  ├── apam_update_intelligence — architecture discussed, API designed, plan created
  └── apam_write_episode       — meaningful chunk of work done (multiple per session ok)

After work
  └── /apam:apam-update → writes pending L1/L3, logs L2 episode

Every 5 unconsolidated episodes (background)
  └── apam_consolidate → distils decisions/patterns/problems → L3 Project Intelligence
```

---

## L3 Project Intelligence

L3 is the durable knowledge layer. Claude writes to it directly via `apam_update_intelligence` the moment knowledge is produced — not deferred to session end.

Records are **upserted by title** — "API Endpoints" always updates the same record. Direct writes and periodic consolidation both feed into it.

**Periodic consolidation** (every 5 episodes) automatically extracts:

| Record type | Source field | Title |
|---|---|---|
| `architecture` | `decisions[]` from episodes | "Key Decisions" |
| `pattern` | `patterns_observed[]` from episodes | "Observed Patterns" |
| `procedural` | `problems_solved[]` from episodes | "Problems Solved" |
| `entity` | Files touched in ≥ 2 episodes | "Module: \<dir\>" |

Run consolidation manually at any time:

```bash
apam consolidate
# or in Claude Code:
/apam:apam-consolidate
```

---

## Hooks Behaviour

`apam init` writes two hooks into `~/.claude/settings.json`:

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

- **`apam-load-context`** — fires before every tool call. If the project DB exists, outputs a message reminding Claude to call `apam_recall`. Always exits 0.
- **`apam-write-episode`** — fires when Claude finishes responding. If an episode was already written in the last 10 minutes, this is a no-op. Otherwise writes a minimal fallback episode with git context. Always exits 0.

The slash commands are the primary interface. The hooks act as a safety net for sessions where the commands weren't used.

---

## Data Storage

All data is stored locally. Nothing leaves your machine.

```
~/.apam/
└── <project-id>/      # 16-char hex derived from git remote URL
    └── apam.db        # SQLite database (WAL mode)
```

`~` is `$HOME` on Mac/Linux and `%USERPROFILE%` on Windows.

**Project ID derivation:**
1. SHA256 of the normalised git remote URL (strips protocol, `.git`, trailing slash) → first 16 hex chars
2. Falls back to SHA256 of the absolute directory path if no git remote exists

---

## Development

```bash
cd packages/apam-mcp
npm install
npm test          # vitest — all tests use in-memory SQLite
npm run build     # compile TypeScript to dist/
```

Tests: 30 tests across 9 files, all in-memory SQLite.

