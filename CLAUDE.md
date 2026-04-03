# APAM — Claude Code Project Context

## What this is

APAM (Anthropomorphic Procedural Agent Memory) is a local-first MCP server + Superpowers
skill that gives Claude Code persistent layered memory across sessions. It is based on an
architecture designed in `D:\Codebases\ubik` and is being built here as a standalone
distributable package.

---

## Current implementation status

Tasks completed:
- [x] Task 1: Project scaffold (package.json, tsconfig, tsup, vitest)
- [x] Task 2: Database schema + client (SQLite, 4 tables, migrations, indexes)

Tasks remaining (Task 3 onwards):
- [ ] Task 3: L1 layer operations
- [ ] Task 4: L2 layer operations
- [ ] Task 5: L3 layer operations
- [ ] Task 6: Utility functions (project-id, git context)
- [ ] Task 7: Consolidation job
- [ ] Task 8: MCP tool handlers
- [ ] Task 9: MCP server entry point
- [ ] Task 10: CLI entry point
- [ ] Task 11: Hook commands
- [ ] Task 12: APAM Superpowers skill
- [ ] Task 13: Full test run + README

---

## Key documents

- **Design spec**: `docs/superpowers/specs/2026-04-03-apam-claude-code-design.md`
- **Implementation plan**: `docs/superpowers/plans/2026-04-03-apam-claude-code.md`

Read the plan before implementing anything. Every task has exact file paths, complete
code, test commands, and expected output. Follow it precisely.

---

## Repo structure

```
packages/
└── apam-mcp/               ← the MCP server + CLI + hooks
    ├── src/
    │   ├── db/             ← schema.ts, client.ts (DONE)
    │   ├── layers/         ← l1.ts, l2.ts, l3.ts (TODO)
    │   ├── tools/          ← recall.ts, pin.ts, write-episode.ts, consolidate.ts, status.ts (TODO)
    │   ├── consolidation/  ← job.ts (TODO)
    │   ├── utils/          ← project-id.ts, git.ts (TODO)
    │   ├── hooks/          ← load-context.ts, write-episode.ts (TODO)
    │   ├── server.ts       ← MCP entry point (TODO)
    │   └── cli.ts          ← CLI entry point (TODO)
    └── tests/              ← mirrors src/ structure
packages/
└── apam-skill/
    └── skill.md            ← Superpowers skill (TODO)
```

---

## Architecture in one paragraph

An MCP server (`packages/apam-mcp`) stores three memory layers in SQLite:
L1 (fast-recall atoms: preferences, decisions, constraints), L2 (session episodes with git
context), and L3 (consolidated semantic cards derived from episodes). Five MCP tools expose
these layers to Claude Code. A Superpowers skill provides the cognitive policy telling
Claude when and how to use the tools. Two Claude Code hooks automate the session lifecycle:
`PreToolUse` triggers context loading at session start, `Stop` writes a fallback episode
at session end. The codebase itself is L4 — Claude reads it directly, no replication.

---

## Development workflow

```bash
cd packages/apam-mcp
npm test            # run all tests (vitest)
npm run build       # compile TypeScript to dist/
```

All implementation follows TDD: write failing test → implement → verify pass → commit.

---

## Tech stack

- **Runtime**: Node.js 18+, TypeScript 5
- **MCP**: `@modelcontextprotocol/sdk` ^1.12.0
- **Database**: `better-sqlite3` ^9.4.3 (synchronous SQLite)
- **Validation**: `zod` ^3.22.4
- **Build**: `tsup` ^8.0.0 (ESM output)
- **Tests**: `vitest` ^1.6.0

---

## Execution approach

This project is being built using **subagent-driven development** (one subagent per task,
spec + quality review after each). When continuing implementation:
1. Read the plan file for the next pending task
2. Dispatch an implementer subagent with the full task text
3. Run spec compliance review, then code quality review
4. Fix any issues, then mark task complete and move to the next

Use `superpowers:subagent-driven-development` skill if available.

---

## Decisions already made

- Local-first SQLite (no cloud, no sync in v1)
- No vector/semantic search (codebase is L4, readable directly)
- Rule-based consolidation in v1 (no LLM API calls for consolidation)
- Consolidation threshold: 5 unconsolidated episodes → auto-trigger
- L1 eviction: salience < 0.2 AND not accessed in 30+ days
- Claude Code only in v1; multi-agent adapters planned for v1.1
- Project ID: SHA256 of git remote URL (first 16 hex chars), fallback to directory path

---

## What NOT to do

- Do not add vector search or embeddings to v1
- Do not add cloud sync or authentication to v1
- Do not build multi-agent adapters yet (v1.1 work)
- Do not change the SQLite schema without updating the test in `tests/db/schema.test.ts`
- Do not skip TDD — write failing tests first, then implement
