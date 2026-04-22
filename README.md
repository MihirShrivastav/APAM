# APAM

APAM is a persistent, layered memory system for coding agents. It keeps project memory in a local SQLite database and exposes that memory through a shared MCP server so different agents can use the same memory store.

This repository now supports:

- Claude Code through the existing Claude-oriented skill package and Claude hooks
- Codex through a globally installed Codex plugin, Codex skills, and user-level Codex config

The database and MCP runtime are shared. Agent-specific behavior lives in thin integration layers.

## Memory Model

APAM stores memory in `~/.apam/<project-id>/apam.db`.

| Layer | Purpose |
| --- | --- |
| `L1` | Fast recall atoms: preferences, project facts, constraints, decisions |
| `L2` | Session episodes: summaries, files touched, decisions, solved problems |
| `L3` | Project intelligence: architecture, patterns, procedures, modules |

Project IDs are derived from the git remote when available, otherwise from the absolute directory path.

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

## Build

```bash
cd packages/apam-mcp
npm install
npm run build
npm link
npm test
```

Manual startup command for the shared MCP server, useful only for debugging or direct local testing:

```bash
cd packages/apam-mcp
npx apam-mcp
```

`npm link` is the recommended install path for local development and usage. It makes these commands available globally on your machine:

- `apam`
- `apam-mcp`
- `apam-load-context`
- `apam-write-episode`

## Shared CLI

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

### `apam init`

Agent-agnostic initialization.

What it does:

- derives the project ID
- creates or opens the APAM database
- leaves agent-specific wiring to `apam integrate ...`

### `apam integrate claude`

Configures Claude integration in `~/.claude/settings.json`.

What it writes:

- `PreToolUse` hook for `apam-load-context`
- `Stop` hook for `apam-write-episode --agent claude-code`

### `apam integrate codex`

Configures Codex integration once for the current user.

What it writes:

- `~/.codex/config.toml`
- `~/.agents/plugins/marketplace.json`
- `~/plugins/apam/.codex-plugin/plugin.json`
- `~/plugins/apam/skills/*`

This install is global. After it is done once, each repo only needs `apam init`.

## Claude Setup

### 1. Build and link the MCP package

```bash
cd packages/apam-mcp
npm install
npm run build
npm link
```

### 2. Register the MCP server with Claude

Add this to Claude settings if you are not relying on the linked `apam-mcp` binary:

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

### 3. Install the Claude APAM skill package

```bash
claude plugin marketplace add /absolute/path/to/APAM/packages/apam-skill
claude plugin install apam@apam
```

### 4. Initialize and integrate

From the target project:

```bash
apam init
apam integrate claude
```

### Claude usage

- first session in a project: `/apam:apam-init`
- start of a normal session: `/apam:apam-fetch`
- after meaningful work: `/apam:apam-update`
- manual distillation: `/apam:apam-consolidate`

## Codex Setup

### 1. Build the MCP package

```bash
cd packages/apam-mcp
npm install
npm run build
npm link
```

### 2. Install Codex integration once

If you used `npm link`, install Codex integration with:

```bash
apam integrate codex
```

If you did not link the package globally, you can still install Codex integration with:

```bash
node packages/apam-mcp/dist/cli.js integrate codex
```

The generated global Codex config uses these commands by name:

- `apam-mcp`
- `apam-load-context`
- `apam-write-episode`

So for normal day-to-day Codex usage, you should prefer the `npm link` flow.

### 3. Initialize APAM in any repository

From a repository you want APAM to manage:

```bash
apam init
```

If you skipped `npm link`, use the built CLI directly instead:

```bash
node /absolute/path/to/APAM/packages/apam-mcp/dist/cli.js init
```

### 4. Open the Codex plugin browser

In Codex CLI:

```text
/plugins
```

Install or enable the `APAM` plugin from the home-level marketplace.

### 5. Use the Codex APAM skills

Explicit skill invocation:

- `$apam`
- `$apam-fetch`
- `$apam-init`
- `$apam-update`
- `$apam-consolidate`

Codex may also surface enabled skills in slash lists depending on the client surface.

### Codex behavior after global install

The generated `~/.codex/config.toml` configures:

- APAM MCP access for all Codex sessions
- `SessionStart` hook to remind Codex that APAM memory exists
- `Stop` hook to write a fallback episode with `agent_name = "codex"` if nothing was written recently

## MCP Tools

These are the shared APAM tools exposed by `packages/apam-mcp/src/server.ts`.

| Tool | Purpose |
| --- | --- |
| `apam_status` | Detect the current project and report memory counts |
| `apam_recall` | Load L1, L3, and recent L2 episodes |
| `apam_pin` | Write or update a fast-recall atom |
| `apam_update_intelligence` | Write or update an L3 intelligence card |
| `apam_write_episode` | Record an L2 episode |
| `apam_consolidate` | Distill unconsolidated L2 episodes into L3 |

### Provenance-aware MCP fields

The following tools now accept optional `agent_name`:

- `apam_pin(..., agent_name?: string)`
- `apam_write_episode(..., agent_name?: string)`
- `apam_update_intelligence(..., agent_name?: string)`

Expected values today:

- `claude-code`
- `codex`

## Verification

From any initialized project:

```bash
apam status
```

If you skipped `npm link`, run:

```bash
node /absolute/path/to/APAM/packages/apam-mcp/dist/cli.js status
```

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

Then open Codex and:

1. run `/plugins`
2. install or enable `APAM`
3. invoke `$apam-fetch` or `$apam-init`

## Development Notes

- `packages/apam-mcp/tests/db/migration.test.ts` covers legacy-to-provenance migration
- `packages/apam-mcp/tests/integrations/claude.test.ts` covers Claude settings writes
- `packages/apam-mcp/tests/integrations/codex.test.ts` covers Codex config, marketplace, and plugin generation

All APAM data stays local to the machine running the MCP server.
