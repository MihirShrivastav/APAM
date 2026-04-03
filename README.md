# APAM MCP — Anthropomorphic Procedural Agent Memory for Claude Code

Gives Claude Code persistent, layered memory across sessions.
No more blank-slate starts. Claude remembers your preferences,
past decisions, and what was worked on — automatically.

## How It Works

- **L1 Fast Recall**: pinned preferences, decisions, constraints
- **L2 Episodes**: automatic session logs with git context
- **L3 Semantic Cards**: consolidated knowledge distilled from episodes
- **L4**: your codebase (Claude Code reads it directly — no duplication)

## Install

```bash
# 1. Start the MCP server (keep it running)
npx apam-mcp

# 2. Add to ~/.claude/claude_desktop_config.json
{
  "mcpServers": {
    "apam": {
      "command": "npx",
      "args": ["apam-mcp"]
    }
  }
}

# 3. Install the APAM skill plugin
# Copy packages/apam-skill/skill.md to your Superpowers skills directory

# 4. Initialise for your project (from the project directory)
npx apam init
```

## CLI

```bash
apam init          # Initialise project + configure Claude Code hooks
apam status        # Memory health snapshot
apam consolidate   # Manually trigger L3 consolidation
apam forget <id>   # Remove an L3 card by ID
```

## Memory Lifecycle

1. **Session start** — `apam_recall` loads L1 + L3 + recent episodes into context
2. **Mid-session** — `apam_pin` saves high-salience facts to L1
3. **Session end** — `apam_write_episode` records what was done
4. **Every 5 episodes** — automatic L3 consolidation distills durable knowledge

## Design

See [docs/superpowers/specs/2026-04-03-apam-claude-code-design.md](docs/superpowers/specs/2026-04-03-apam-claude-code-design.md)
