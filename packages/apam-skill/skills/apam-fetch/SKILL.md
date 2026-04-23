---
name: apam-fetch
description: Load APAM memory for the current project. Call this at the start of any session to restore context from previous sessions.
---

# APAM Fetch - Load Project Memory

Load all persistent memory for the current project and report what you find.

## Steps

1. Run `/apam:apam-status` or run `apam status` in the current repository using the local shell.
2. Read the output. Find the line that says `Project: <hex>`. Copy that 16-character hex string exactly. This is the `project_id`.
   - Never construct or guess the `project_id`. If the output does not contain a `Project:` line, something went wrong and you should report it.
3. Call `apam_recall` with that `project_id`.
4. Read the returned memory and summarize what you now know:
   - What this project is
   - Key facts from L1 (tech stack, structure, constraints)
   - Recent session history from L2
   - Key L3 Project Intelligence records (architecture, entities, patterns)
5. State what context you have loaded so the user knows memory is active.

## What to report

After loading, briefly tell the user:
- What project was detected (`project_id` plus any label you can infer)
- How many L1 atoms, L2 episodes, and L3 records exist
- The 2-3 most relevant things from the loaded context
- If this is a new project with no memory, say so clearly and suggest running `/apam:apam-init`
