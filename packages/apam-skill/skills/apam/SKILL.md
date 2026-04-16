---
name: apam
description: APAM Memory — gives Claude Code persistent, layered memory across sessions. Use at session start to load context, mid-session to pin facts and update intelligence, and before finishing to write an episode. Invoke whenever a new session begins or memory operations are needed.
---

# APAM Memory Skill

## Quick Commands

| Command | When to use |
|---|---|
| `/apam:apam-fetch` | Start of any session — load memory |
| `/apam:apam-init` | First time in a new project — bootstrap memory |
| `/apam:apam-update` | After building or designing something — save what was learned |
| `/apam:apam-consolidate` | Manually distil L2 episodes into L3 records |

Use the focused commands above for day-to-day use. This document is the full policy reference.

You have access to persistent layered memory via the APAM MCP server. This memory persists across sessions — you never start blank. **Follow this policy exactly and proactively.** Do not wait to be asked to write memory. Write it as the knowledge is produced.

---

## The Three Memory Layers

### L1 — Fast Recall
Quick-access facts loaded into every session. Two categories:

**Global** (applies to all projects):
- User preferences ("prefers concise responses", "always use tabs")
- Communication style, tone, formatting preferences
- Workflow preferences ("always run tests before committing")

**Project-specific** (loaded only for this project):
- What the project is and what problem it solves (one sentence)
- Tech stack: languages, frameworks, key libraries
- Folder/module structure: what lives where
- Key entry points: main files, config files, server start command
- APIs and endpoints: names and one-line purpose each
- Databases and data models: what DB, what main schemas/collections
- Key external services or integrations
- Active constraints: "do not use X", "always go through Y"

**L1 is an index, not a journal.** Each atom is one fact, one sentence. Keep it scannable.

### L2 — Episodes
A log of what happened during sessions. Written by Claude, not auto-generated. Each episode records a meaningful unit of work — you can write multiple episodes per conversation if multiple distinct things were accomplished.

Each episode should capture:
- What was done (2–4 sentence summary)
- Key decisions made
- Files significantly changed
- Problems fixed
- Patterns noticed
- If a plan was created: one-line summary + path to the plan file
- If docs were created: one-line summary + path to the doc file

### L3 — Project Intelligence
Durable, structured knowledge about the project. **Write to this directly and immediately** using `apam_update_intelligence` — do not wait for episode consolidation. The periodic consolidation job will also update it, but direct writes are the primary path.

What belongs here:

| Type | Example titles | Content |
|---|---|---|
| `architecture` | "System Overview", "Auth Design", "Data Pipeline" | How the system is structured, key design choices, why things are built the way they are |
| `entity` | "API Endpoints", "Database Schema", "Key Modules", "Integrations" | What exists: names, purposes, relationships — orientation-level, not full specs |
| `procedural` | "How to Run Tests", "Deployment Process", "Local Setup" | Step-by-step how-to knowledge needed repeatedly |
| `pattern` | "Error Handling", "Naming Conventions", "Test Strategy" | Recurring approaches, rules, conventions in the codebase |

Also write Project Intelligence for:
- **Future plans** (`architecture` type, title "Future Plans"): things discussed but not yet built
- **Known issues** (`entity` type, title "Known Issues"): bugs or limitations noted
- **Enhancement ideas** (`pattern` type, title "Enhancement Ideas"): improvements discussed

---

## Session Start Protocol

At the very start of every session, **before doing anything else**:

1. Call `apam_status` **with no arguments** — it auto-detects the project from the current directory
2. The output will contain a line like `Project: a1b2c3d4e5f6a7b8`. **Copy those 16 hex characters exactly.** Use this string as `project_id` in every subsequent tool call.
3. Call `apam_recall` with that `project_id`
4. Read the returned context — it tells you the project, history, and what's known
5. If this is a **new project** (no memory found):
   - Explore briefly: read package.json, README, folder structure
   - OR ask the user: what is this project, what tech stack, what's the goal
   - Then immediately pin what you learn to L1 and write initial Project Intelligence records

**Do not answer the user's request until you have loaded memory.**

> **Critical:** The `project_id` is the 16-char hex string on the `Project:` line of `apam_status` output. It looks like `a1b2c3d4e5f6a7b8`. Never use a directory name, repo name, or any other string — doing so silently stores data in a phantom project that is never loaded. If you are unsure, call `apam_status` again and read the value off the output.

---

## During a Session: Write Memory As You Go

### Write to L1 when:

**New fact** — something not covered by any existing atom:
- A user preference
- A new endpoint, module, service, or dependency
- A constraint ("never expose X", "this service is rate-limited")
- A confirmed decision

**Existing atom is stale** — this session changed something an atom describes:
- A tool was added or removed → update the tools atom
- Folder structure changed → update the structure atom
- Stack changed (new lib added, something swapped out) → update the stack atom
- A constraint was lifted or changed → update the constraint atom

Call `apam_pin` with the corrected full content. The upsert matches on type+content+scope, so write the complete updated fact — not just the delta. One fact per atom.

### Write Project Intelligence immediately when:
- Architecture or design is discussed — even if nothing is built yet
- A new module, API, or service is designed or described
- You discover how something works that wasn't previously in memory
- Future plans or enhancements are discussed
- A document or plan is created (add a record pointing to it)
- A pattern or convention is established

**Call `apam_update_intelligence` in the same response where the knowledge is produced.** Do not defer to end of session.

### Write an L2 episode when a meaningful chunk of work is complete:
- After implementing a feature
- After debugging and resolving an issue
- After creating a plan or design document
- After a significant design discussion that produced decisions

Multiple episodes per conversation is fine — follow the work boundaries, not the conversation.

---

## Populating L1 for a New Project

When you first encounter a project, pin these in order:

1. `[decision/project]` What this project is — one sentence
2. `[decision/project]` Tech stack (languages, frameworks, key libraries)
3. `[decision/project]` Key folder structure (where is src, tests, config)
4. `[decision/project]` Entry points (main file, CLI, server start command)
5. `[decision/project]` APIs/endpoints — names and one-line purpose each
6. `[decision/project]` Database/data layer — what DB, what main models
7. `[decision/project]` Key external services or integrations
8. `[constraint/project]` Any stated constraints or rules

Then write Project Intelligence records for architecture and entities with more detail.

---

## Session End Protocol

Before your final response in any meaningful session:

1. Write any pending Project Intelligence not yet written mid-session
2. Write one or more L2 episodes
3. Pin any new L1 facts learned

---

## Example: First Session on a New Project

User: "Let's build a REST API for task management using Node.js and PostgreSQL."

You:
1. Call `apam_recall` → "new project, no memory"
2. Pin to L1:
   - `[decision/project]` "Task management REST API — Node.js + PostgreSQL"
   - `[decision/project]` "Stack: Node.js, Express, PostgreSQL, TypeScript"
3. Write Project Intelligence immediately:
   ```
   apam_update_intelligence(type='architecture', title='System Overview',
     content='REST API for task management. Express server, PostgreSQL database,
     TypeScript. Users create, update, delete, and query tasks.')
   ```
4. Proceed with the work — as each design decision is made, write more records
5. At the end, write an L2 episode

---

## Example: Updating Project Intelligence Mid-Session

User asks to add team endpoints. After designing them:

```
apam_update_intelligence(
  type='entity',
  title='API Endpoints',
  content='POST /tasks, GET /tasks, PATCH /tasks/:id, DELETE /tasks/:id — task CRUD
POST /teams, GET /teams/:id — team management
POST /teams/:id/members — add member
All routes require Bearer JWT.'
)
```

Do this **in the same response where you design the endpoints**.

---

## Memory Hygiene

- **No duplicates.** If a fact is in recall output, do not re-pin — update the existing record instead (upsert merges automatically).
- **L1 atoms are granular.** One fact per atom. Not: "project is X built with Y and Z and uses W for Q." Split into separate atoms.
- **Project Intelligence titles are keys.** "API Endpoints" always refers to the same record — use consistent titles so records update, not multiply.
- **If a Project Intelligence record is wrong**, tell the user and suggest: `apam forget <card-id>` then rewrite with `apam_update_intelligence`.
- **Trust `user_confirmed` L1 facts absolutely.** Treat `claude_inferred` as strong defaults the user can override.
- **Do not write episodes for trivial sessions** — brief clarifying exchanges, no code written, no decisions made.
