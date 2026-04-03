---
name: apam
description: APAM Memory — gives Claude Code persistent, layered memory across sessions. Use at session start to load context, mid-session to pin facts, and before finishing to write an episode. Invoke whenever a new session begins or memory operations are needed.
---

# APAM Memory Skill

You have access to persistent layered memory via the APAM MCP server. This memory
persists across sessions so you never start blank. Follow this policy exactly.

## Session Start Protocol

At the very start of every new session (first response), call `apam_recall` with the
current project ID before doing anything else:

1. Derive the project ID by calling: `apam_status` (it will show the project context)
   OR use the project ID from the hook output if available in the conversation.
2. Call `apam_recall` with that project_id.
3. Read the returned context carefully — it contains:
   - **L1 Fast Recall**: user preferences, decisions, constraints, commitments
   - **L3 Project Knowledge**: architecture, patterns, procedures, key modules
   - **Recent Sessions**: what was worked on recently
4. Use this context to inform your behaviour for the entire session. Do not re-read
   files you already know the purpose of from L3 cards.

## Deriving the Project ID

The project ID is a 16-char hex string derived from the git remote URL (or directory
path). Get it by running:
```
apam_status
```
The output will include the project ID. Alternatively, if the `apam-load-context`
hook fired at session start, the project_id is in the hook output JSON.

## Mid-Session: When to Pin Facts (L1)

Call `apam_pin` when you learn something that should persist across sessions. Apply
this test before pinning: **will this change how I behave in a future session?**

Pin with `confidence: "user_confirmed"` when:
- The user explicitly says "remember this", "always do X", "never do Y"
- The user confirms a preference when asked
- A tech/architecture decision is explicitly agreed upon

Pin with `confidence: "claude_inferred"` when:
- You observe a consistent pattern the user hasn't stated explicitly
- A decision is made that will affect the architecture long-term
- A constraint is established (e.g., "we don't use mocks in tests")

**Do NOT pin:**
- Task details specific to this session
- Transient facts ("the build is currently failing")
- Things already in L3 cards

Use `scope: "global"` for user preferences that apply to all projects.
Use `scope: "project"` for project-specific decisions. Include `project_id`.

## Session End: Writing an Episode (L2)

Before your final response in a session where meaningful work was done, call
`apam_write_episode`. Include:

- **summary**: 2–4 sentences describing what was accomplished
- **decisions**: list of architectural or technical choices made (strings)
- **problems_solved**: bugs fixed, blockers cleared (strings)
- **patterns_observed**: recurring approaches you noticed (strings)
- **files_touched**: key files changed (you can list the most significant ones)
- **git_branch**: current branch (from git context if available)

A "meaningful session" is one where:
- Code was written or changed
- An architectural decision was made
- A bug was debugged and resolved
- A significant new approach was established

Skip `apam_write_episode` for very short sessions (< 5 minutes, single clarifying
question answered, no code written).

## Example Episode

```json
{
  "project_id": "a1b2c3d4e5f6a7b8",
  "session_start": "2026-04-03T09:00:00Z",
  "session_end": "2026-04-03T11:30:00Z",
  "git_branch": "feat/auth",
  "git_commit_before": "abc123",
  "git_commit_after": "def456",
  "files_touched": ["src/auth/jwt.ts", "tests/auth/jwt.test.ts"],
  "summary": "Implemented JWT authentication with refresh token rotation. Fixed a token expiry bug where clock skew caused false rejections. Added integration tests.",
  "decisions": ["use JWT over sessions for stateless auth", "15-minute access token TTL with 7-day refresh"],
  "problems_solved": ["fixed clock skew causing token rejections — added 30s leeway"],
  "patterns_observed": ["always write integration tests alongside auth changes"]
}
```

## Memory Hygiene

- Do not write duplicate L1 facts. If a fact is already in L1 recall output, do not
  pin it again.
- Do not write episodes for trivial sessions.
- If an L3 card is obviously wrong, tell the user and suggest running `apam forget
  <card-id>` followed by `apam consolidate` to regenerate.
- Trust L1 `user_confirmed` facts absolutely. Treat `claude_inferred` as strong
  defaults that the user can override.
