# APAM for Claude Code — Design Spec

**Date**: 2026-04-03  
**Status**: Approved  
**Author**: Mihir Shrivastav + Claude

---

## 1. Background

This project adapts the Anthropomorphic Procedural Agent Memory (APAM) architecture —
defined in `Layered Memory Architecture/Anthropomorphic Procedural Agent Memory.md` —
for use with Claude Code. The core problem it solves: every Claude Code session starts
blank. Claude has no memory of past decisions, architectural context, user preferences,
or what was worked on previously. APAM gives Claude a persistent, structured,
self-maintaining memory fabric across sessions.

The codebase itself (files + git history) serves as L4 ground truth. APAM adds the
layers above it that Claude Code cannot derive from files alone: episodic session
history, consolidated semantic knowledge, and hot-recalled preferences and decisions.

---

## 2. Goals

- Claude Code starts every session with full project and user context — no manual
  briefing required
- Memory maintains itself: episodes are logged automatically, knowledge is consolidated
  automatically, no user discipline required
- Distributable as a single installable package (`npx apam-mcp`) + a Superpowers
  skill plugin
- Local-first: one SQLite file per project, no cloud dependency, works offline
- Provenance-safe: derived knowledge always links to source episodes; nothing is
  silently overwritten

---

## 3. Non-Goals

- Vector/semantic search (codebase is L4, directly readable by Claude Code)
- Team-shared or cloud-synced memory (future work)
- L5+ compliance vault, retention management (out of scope for v1)
- Replacing or wrapping the existing `~/.claude/projects/*/memory/` file system
  (APAM runs alongside it, not instead of it)

---

## 4. Architecture

Three components work together:

```
┌─────────────────────────────────────────────────────┐
│                  Claude Code Session                 │
│                                                      │
│  ┌──────────────┐    ┌────────────────────────────┐  │
│  │  APAM Skill  │    │     Claude Code Hooks      │  │
│  │              │    │                            │  │
│  │ · recall     │    │ · session-start → load ctx │  │
│  │ · pin_fact   │    │ · session-end  → write L2  │  │
│  │ · consolidate│    │ · N episodes   → L3 consolidate │
│  └──────┬───────┘    └────────────┬───────────────┘  │
│         │                        │                   │
└─────────┼────────────────────────┼───────────────────┘
          │     MCP Protocol       │
          ▼                        ▼
┌─────────────────────────────────────────────────────┐
│              APAM MCP Server (TypeScript)            │
│                                                      │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │   L1    │  │    L2    │  │        L3          │  │
│  │ Fast    │  │ Episodes │  │ Semantic/Procedural │  │
│  │ Recall  │  │          │  │ Cards              │  │
│  └────┬────┘  └────┬─────┘  └────────┬───────────┘  │
│       └────────────┴─────────────────┘               │
│                         │                            │
│                   ┌─────▼─────┐                      │
│                   │  SQLite   │                      │
│                   └───────────┘                      │
│                                                      │
│  CLI: apam init | status | consolidate | search      │
└─────────────────────────────────────────────────────┘
          │
          ▼
     L4: Codebase + git history (already exists)
```

### 4.1 APAM MCP Server

TypeScript process, started with `npx apam-mcp`. Owns all storage and retrieval.
Stores one SQLite database per project at `~/.apam/<project-id>/apam.db`.
Project ID is derived from the git remote URL (or directory path if no remote).

Also ships a CLI for inspection and manual control:
- `apam init` — initialise memory for current project
- `apam status` — show L1/L2/L3 counts, last consolidation timestamp
- `apam consolidate` — manually trigger L3 consolidation
- `apam forget <id>` — remove or deprecate an L1 atom

### 4.2 APAM Skill

The cognitive layer. Loaded into every Claude Code session as a Superpowers plugin.
Tells Claude how to interact with the MCP server: when to recall, what qualifies as
an L1-worthy fact, how to structure an episode summary at session end, and what
consolidation should produce. The intelligence of APAM lives here, not in the server.

### 4.3 Claude Code Hooks

Wired in the user's `settings.json` on install:

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

- `PreToolUse` fires on the first tool call of a session. The server tracks session
  IDs to ensure context is loaded exactly once per session, not on every tool call.
- `Stop` fires when Claude finishes responding, capturing the session before it closes.

**Graceful degradation**: Both hook commands must exit with code 0 even when the
APAM server is not running. If the server is unreachable, the hook logs a warning
and no-ops silently. Claude Code sessions must never be blocked by APAM unavailability.

---

## 5. Data Model

### 5.1 L1 Atom — Fast Recall

```typescript
{
  id: string,                          // uuid
  layer: 1,
  type: "preference"                   // how user likes to work
       | "decision"                    // architectural or tech choice
       | "constraint"                  // things to avoid / rules
       | "commitment",                 // planned work, promises
  scope: "global" | "project",         // global loads into every project
  project_id: string | null,           // null for global scope
  content: string,                     // concise plain text, single fact
  confidence: "user_confirmed"         // user stated explicitly
             | "claude_inferred",      // Claude judged high-salience
  salience: number,                    // 0.0–1.0, drives eviction when stale
  source_episode_id: string | null,    // which session produced this
  created_at: string,                  // ISO timestamp
  updated_at: string
}
```

**Scope rule**: User preferences (`global`) load into every session regardless of
project. Decisions and constraints are `project`-scoped and load only for the relevant
project.

**Duplicate prevention**: On write, the server fingerprints `type + content` and
overwrites an existing matching atom rather than creating a duplicate.

### 5.2 L2 Atom — Episode

```typescript
{
  id: string,                          // uuid
  layer: 2,
  project_id: string,
  session_start: string,               // ISO timestamp
  session_end: string,
  git_branch: string,
  git_commit_before: string,           // HEAD at session start
  git_commit_after: string,            // HEAD at session end (may be same)
  files_touched: string[],             // relative paths
  summary: string,                     // 2–4 sentence plain text
  decisions: string[],                 // key choices made this session
  problems_solved: string[],           // bugs fixed, blockers cleared
  patterns_observed: string[],         // recurring approaches, style signals
  consolidated: boolean                // has L3 consolidation consumed this?
}
```

**Immutability rule**: L2 episodes are append-only. The `consolidated` flag is the
only field that changes after write. Episodes are never deleted or edited.

### 5.3 L3 Atom — Semantic / Procedural Card

```typescript
{
  id: string,                          // uuid
  layer: 3,
  type: "architecture"                 // system structure, key components
       | "procedural"                  // how to build, test, deploy
       | "pattern"                     // recurring approach or convention
       | "entity",                     // key module, concept, or abstraction
  project_id: string,
  title: string,                       // short label, e.g. "Auth flow"
  content: string,                     // structured plain text, max ~300 words
  source_episode_ids: string[],        // provenance — episodes this was built from
  version: number,                     // increments on each consolidation update
  created_at: string,
  updated_at: string
}
```

**Provenance rule**: Every L3 card carries the IDs of all L2 episodes that contributed
to it. If a card is ever wrong or stale, delete it and re-run consolidation — the
source episodes are immutable ground truth.

---

## 6. MCP Tools

Five tools exposed by the server:

### `apam_recall(project_id, scope?)`
Called at session start. Returns:
- All `global` L1 atoms
- All `project`-scoped L1 atoms for `project_id`
- All L3 cards for `project_id`
- Last 2 L2 episodes for `project_id`

No search involved — pure key/entity lookup. Fast and deterministic.

### `apam_pin(type, content, scope, confidence, source_episode_id?)`
Writes an L1 atom. Called mid-session when Claude detects a high-salience fact or
when the user explicitly asks to remember something. Checks for existing atom with
matching fingerprint before writing to prevent duplicates.

**L1 salience criteria** (Claude judges against these):
- Will this change how I behave in future sessions? (yes → pin)
- Is this a stable fact or a transient task detail? (stable → pin)
- Did the user state this explicitly or confirm it? (yes → `user_confirmed`)
- Is this scoped to this project or universal? (determines `scope`)

### `apam_write_episode(project_id, session_start, session_end, git_context, summary, decisions, problems_solved, patterns_observed)`
Writes an L2 episode. Called exclusively by the `Stop` hook at session end — never
called manually mid-session. After writing, server automatically checks the
unconsolidated episode count.

### `apam_consolidate(project_id)`
Triggers L3 consolidation. Called automatically by the server when unconsolidated
episode count crosses threshold (default: 5). Also available manually via CLI and
via skill command for explicit user-triggered consolidation.

### `apam_status(project_id?)`
Returns a memory health snapshot:
- L1 atom count (global + project)
- Unconsolidated L2 episode count
- Total L2 episode count
- L3 card count by type
- Last consolidation timestamp
- Next consolidation trigger threshold

---

## 7. Update + Consolidation Flow

### Session Start
```
Hook fires (PreToolUse, first call of session)
  → apam_recall(project_id)
  → server returns: global L1 + project L1 + all L3 cards + last 2 episodes
  → skill injects as structured context block into Claude's working context
  → Claude begins with full project knowledge, no files read yet
```

### During Session
```
User confirms a decision
  → Claude calls apam_pin("decision", ..., "user_confirmed")

User says "remember X" / "always do Y"
  → Claude calls apam_pin(..., "user_confirmed")

Claude detects high-salience stable fact
  → Claude calls apam_pin(..., "claude_inferred")
  → Criteria: affects future sessions + stable + not a transient task detail
```

### Session End
```
Stop hook fires
  → skill assembles episode:
      · git context via git log / git diff (branch, before/after commit, files)
      · session summary (2–4 sentences: what was worked on, what changed)
      · decisions[], problems_solved[], patterns_observed[] extracted from session
  → apam_write_episode() → L2 atom written, consolidated=false
```

### Post-Write Auto-Check (server-side)
```
After every apam_write_episode():
  SELECT COUNT(*) WHERE consolidated=false AND project_id=X

  count < 5  → nothing
  count >= 5 → spawn async consolidation job
```

### Consolidation Job
```
1. Fetch all episodes WHERE consolidated=false AND project_id=X

2. Extract signals by type:
   · decisions[]        → candidates for "architecture" or "decision" L3 cards
   · patterns_observed[] → candidates for "pattern" cards
   · problems_solved[]  → candidates for "procedural" cards
   · files_touched      → candidates for "entity" cards (key modules)

3. For each signal group:
   · Existing L3 card for this topic?
       YES → merge new content, increment version, extend source_episode_ids
       NO  → create new L3 card with source_episode_ids

4. Mark all processed episodes: consolidated=true

Rule: consolidation never deletes or mutates L2 episodes.
      L3 cards are the derived view. To correct a wrong card:
      delete the card, re-run apam_consolidate().
```

### Next Session
```
apam_recall() returns updated L1 + updated L3 cards
Claude starts with consolidated knowledge from all prior sessions
```

---

## 8. Installation

```bash
# 1. Start the MCP server
npx apam-mcp

# 2. Add to Claude Code MCP config (~/.claude/claude_desktop_config.json)
{
  "mcpServers": {
    "apam": {
      "command": "npx",
      "args": ["apam-mcp"]
    }
  }
}

# 3. Install the APAM Superpowers skill plugin
# (via Superpowers plugin manager or manual copy to ~/.claude/plugins/)

# 4. Initialise memory for current project
apam init

# Hooks are configured automatically by apam init in settings.json
```

---

## 9. Distribution

- **npm package** (`apam-mcp`): the MCP server + CLI, published to npmjs.com
- **Superpowers plugin** (`apam-skill`): the skill plugin, published to the
  Superpowers plugin registry and GitHub
- **Single README** covers installation in under 5 minutes

---

## 10. Open Questions (deferred to implementation)

1. **Consolidation model**: Does the consolidation job use Claude itself (via API
   call) to synthesise episodes into L3 cards, or a deterministic rule-based
   extractor? Claude produces better cards but adds cost/latency. Rule-based is free
   and fast but lower quality. Recommend: Claude-based with a configurable fallback.

2. **Session ID tracking**: How does the server know it's a new session vs a
   continuation? Options: timestamp gap threshold, explicit session token passed by
   hook, or `Stop` hook presence/absence.

3. **L1 eviction policy**: When L1 grows large and stale (high count, low salience
   scores), what triggers eviction? Recommend: on each `apam_recall`, evict atoms
   with `salience < 0.2` that haven't been accessed in 30+ days.

4. **Project ID derivation**: Git remote URL is clean but fails for local-only repos.
   Fallback: SHA of absolute directory path.
