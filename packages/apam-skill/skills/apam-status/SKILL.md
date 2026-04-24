---
name: apam-status
description: Resolve the authoritative APAM project ID for the current repository by running the local APAM CLI in the repo context.
---

# APAM Status

## Steps

1. Run `apam status` from the current repository using the local shell.
2. Read the line that starts with `Project:` and copy the exact 16-character hex value.
3. Treat that value as the authoritative `project_id` for all APAM MCP tool calls in this session.
4. Report the project ID and any useful counts from the status output.

## Rules

- Do not construct or guess the `project_id`.
- Do not rely on MCP `apam_status` with no arguments for project discovery in a long-lived agent session, because the MCP server may be running from a different cwd.
- If `apam` is not globally available, run `node /absolute/path/to/APAM/packages/apam-mcp/dist/cli.js status` from the target repository instead.
