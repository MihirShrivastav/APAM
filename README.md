# APAM

**A**nthropomorphic **P**rocedural **A**gent **M**emory, is a persistent, layered memory system for coding agents.

It keeps project memory in a local SQLite database and exposes that memory through a shared MCP server, so different agents can work against the same memory store across sessions.

APAM now supports:

- Claude Code through the existing Claude-oriented skill package and Claude hooks
- Codex through a globally installed Codex plugin, Codex skills, and user-level Codex config

The database and MCP runtime are shared. Agent-specific behavior lives in thin integration layers.

## Why APAM

APAM is useful when you want project memory to survive across tools, sessions, and context resets.

- The memory model, architecture, and interaction patterns stay consistent across Claude Code and Codex.
- You can move between supported coding agents on the same project without rebuilding project context from scratch each time.
- New sessions do not have to spend as much time re-reading the repository just to recover the basics.
- Important decisions, constraints, module knowledge, and recent work can be recalled from local memory instead of being rediscovered repeatedly.
- Episodic memory preserves what was done, in what order, and why, which helps a new session or a different coding agent understand the sequence of work instead of only the latest state.
- That episode trail makes it easier to resume interrupted work, understand how a bug or design choice emerged, and avoid repeating investigation that already happened in an earlier session.
- Across multiple coding agents, episodic memory improves handoffs because one agent can see what another agent changed, decided, or ruled out before continuing.
- Because the memory store is local and shared, APAM helps maintain continuity while still keeping project data on your own machine.

## Memory Model

APAM stores memory in `~/.apam/<project-id>/apam.db`.

| Layer | Purpose |
| --- | --- |
| `L1` | Fast recall atoms: preferences, project facts, constraints, decisions |
| `L2` | Session episodes: summaries, files touched, decisions, solved problems |
| `L3` | Project intelligence: architecture, patterns, procedures, modules |

Project IDs are derived from the git remote when available, otherwise from the absolute directory path.

For agent workflows, the authoritative way to resolve the current repository's `project_id` is to run `apam status` from that repository and copy the exact `Project:` value. Do not rely on MCP `apam_status` auto-detection in a long-lived agent session, because the server process may be running from a different current working directory.

## Provenance

APAM is now provenance-aware.

- L1 atoms store `source_agent`
- L2 episodes store `agent_name`
- L3 cards store `created_by_agent` and `updated_by_agent`
- Inferred facts now use `confidence = "agent_inferred"` instead of `claude_inferred`

Existing Claude-era databases are migrated automatically. Legacy `claude_inferred` rows are rewritten to `agent_inferred`, and migrated rows are backfilled with `claude-code` provenance.

## Repository Layout

- `packages/apam-mcp`
  Shared MCP server, CLI, SQLite schema, consolidation logic, and integration writers
- `packages/apam-skill`
  Claude-oriented APAM skill package
- `~/plugins/apam`
  Home-level Codex plugin with Codex-native APAM skills
- `~/.agents/plugins/marketplace.json`
  Home-level Codex marketplace entry for the APAM plugin
- `~/.codex/config.toml`
  User-level Codex MCP and hook configuration

## Prerequisites

Before installing APAM, make sure you have:

- Git installed so you can clone or pull the repository
- Node.js installed
- npm available on your PATH

APAM is implemented in TypeScript/Node.js and builds to a Node-based MCP server and CLI.

Recommended baseline:

- Node.js 18 or newer

Official downloads and docs:

- Node.js: `https://nodejs.org/`
- Git: `https://git-scm.com/downloads`

## Installation

The clean mental model is:

1. Do the shared APAM install once on your machine.
2. Add Claude support and/or Codex support once on your machine.
3. In each repository you want APAM to track, run `apam init`.

### 1. Shared APAM install

First, get the repository onto your machine and make sure it is up to date.

If you do not have the repo yet:

```bash
git clone https://github.com/MihirShrivastav/APAM.git
cd APAM
```

If you already have the repo:

```bash
cd /path/to/APAM
git pull
```

Then build and link the shared MCP package once:

```bash
cd packages/apam-mcp
npm install
npm run build
npm link
npm test
```

`npm link` is the recommended path because it makes these commands available globally:

- `apam`
- `apam-mcp`
- `apam-load-context`
- `apam-write-episode`

Manual startup command for the shared MCP server, useful only for debugging or direct local testing:

```bash
cd packages/apam-mcp
npx apam-mcp
```

After linking or running the built package, APAM exposes:

```bash
apam init
apam integrate claude
apam integrate codex
apam integrate all
apam status
apam consolidate
apam forget <card-id>
```

What the shared commands do:

- `apam init`
  Derives the project ID for the current repository and creates or opens the local APAM database for that project.
- `apam integrate claude`
  Adds Claude-specific APAM hooks in `~/.claude/settings.json`.
- `apam integrate codex`
  Adds Codex-specific APAM config, local marketplace metadata, and generated plugin files under your home directory.

### 2. Claude global setup

Do this once per machine if you want APAM in Claude Code.

Register the APAM MCP server with Claude:

```json
{
  "mcpServers": {
    "apam": {
      "command": "node",
      "args": ["/absolute/path/to/APAM/packages/apam-mcp/dist/server.js"]
    }
  }
}
```

If you are relying on the linked `apam-mcp` binary, keep using that installed binary for normal usage. The JSON above is the direct-path fallback when you want Claude to point at the built server explicitly.

Install the Claude APAM skill package:

```bash
claude plugin marketplace add /absolute/path/to/APAM/packages/apam-skill
claude plugin install apam@apam
```

Then enable the Claude-side APAM hooks:

```bash
apam integrate claude
```

What Claude integration writes:

- `PreToolUse` hook for `apam-load-context`
- `Stop` hook for `apam-write-episode --agent claude-code`

Claude session workflow:

- first step in a project session: `/apam:apam-status`
- first session in a project: `/apam:apam-init`
- start of a normal session: `/apam:apam-fetch`
- after meaningful work: `/apam:apam-update`
- manual distillation: `/apam:apam-consolidate`

Claude should use `/apam:apam-status` or local `apam status` output to fetch the exact `project_id`, then pass that value explicitly into APAM MCP tool calls.

### 3. Codex global setup

Do this once per machine if you want APAM in Codex.

Install Codex integration:

```bash
apam integrate codex
```

If you skipped `npm link`, use the built CLI directly instead:

```bash
node /absolute/path/to/APAM/packages/apam-mcp/dist/cli.js integrate codex
```

What Codex integration writes:

- `~/.codex/config.toml`
- `~/.agents/plugins/marketplace.json`
- `~/plugins/apam/.codex-plugin/plugin.json`
- `~/plugins/apam/skills/*`

The generated Codex config expects these commands to exist by name:

- `apam-mcp`
- `apam-load-context`
- `apam-write-episode`

That is why the `npm link` flow is the recommended day-to-day install path.

After running `apam integrate codex`, install or enable the APAM plugin from either Codex surface.

Codex CLI:

```text
/plugins
```

Then install or enable `APAM` from the local marketplace.

Codex app:

1. Open the Plugins browser.
2. Change the source filter from `Built by OpenAI` to `APAM Local Plugins`.
3. Install or enable `APAM`.

Codex session workflow:

- `$apam`
- `$apam-status`
- `$apam-fetch`
- `$apam-init`
- `$apam-update`
- `$apam-consolidate`

Codex may also surface enabled skills in slash lists depending on the client surface.

Codex should use `$apam-status` or local `apam status` output to fetch the exact `project_id`, then pass that value explicitly into APAM MCP tool calls.

The generated `~/.codex/config.toml` also configures:

- APAM MCP access for all Codex sessions
- `SessionStart` hook to remind Codex that APAM memory exists
- `Stop` hook to write a fallback episode with `agent_name = "codex"` if nothing was written recently

### 4. Per-repository setup

After the shared install and whichever agent integration you want are already set up, each repository only needs:

```bash
apam init
```

If you skipped `npm link`, use the built CLI directly instead:

```bash
node /absolute/path/to/APAM/packages/apam-mcp/dist/cli.js init
```

This creates or opens the APAM database for the current repository. After that, Claude Code or Codex can use the APAM skills for that repo.

## MCP Tools

These are the shared APAM tools exposed by `packages/apam-mcp/src/server.ts`.

| Tool | Purpose |
| --- | --- |
| `apam_status` | Report memory counts for a supplied `project_id`, or auto-detect from the server process cwd when no `project_id` is supplied |
| `apam_recall` | Load L1, L3, and recent L2 episodes |
| `apam_pin` | Write or update a fast-recall atom |
| `apam_update_intelligence` | Write or update an L3 intelligence card |
| `apam_write_episode` | Record an L2 episode |
| `apam_consolidate` | Distill unconsolidated L2 episodes into L3 |

For Claude Code and Codex agent sessions, prefer local `apam status` for project discovery and then pass the exact `project_id` into MCP tool calls explicitly. The no-argument `apam_status` MCP path is only reliable when the MCP server itself is running with the target repository as its cwd.

### Provenance-aware MCP fields

The following tools now accept optional `agent_name`:

- `apam_pin(..., agent_name?: string)`
- `apam_write_episode(..., agent_name?: string)`
- `apam_update_intelligence(..., agent_name?: string)`

Expected values today:

- `claude-code`
- `codex`

## Verification

From any initialized project, verify project detection with:

```bash
apam status
```

If you skipped `npm link`, run:

```bash
node /absolute/path/to/APAM/packages/apam-mcp/dist/cli.js status
```

For Claude, confirm the MCP server registration and APAM hooks are present in your Claude settings.

For global Codex integration:

macOS/Linux:

```bash
cat ~/.codex/config.toml
cat ~/.agents/plugins/marketplace.json
cat ~/plugins/apam/.codex-plugin/plugin.json
```

Windows PowerShell:

```powershell
Get-Content $HOME\.codex\config.toml
Get-Content $HOME\.agents\plugins\marketplace.json
Get-Content $HOME\plugins\apam\.codex-plugin\plugin.json
```

Then:

1. In Codex CLI, run `/plugins` and confirm `APAM` is installed or enabled.
2. Or in the Codex app, open the Plugins browser, choose `APAM Local Plugins`, and confirm `APAM` is installed or enabled.
3. In the target repository, run `apam status` and confirm the `Project:` value is stable.
4. Invoke `$apam-status`, `$apam-fetch`, or `$apam-init` in Codex, or `/apam:apam-status` and `/apam:apam-fetch` in Claude.

## Development Notes

- `packages/apam-mcp/tests/db/migration.test.ts` covers legacy-to-provenance migration
- `packages/apam-mcp/tests/integrations/claude.test.ts` covers Claude settings writes
- `packages/apam-mcp/tests/integrations/codex.test.ts` covers Codex config, marketplace, and plugin generation

All APAM data stays local to the machine running the MCP server.
