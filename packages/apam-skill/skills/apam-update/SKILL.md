---
name: apam-update
description: Write APAM memory for what was learned or built in this session. Updates L1 atoms, L3 Project Intelligence records, and writes an L2 episode. Call after implementing a feature, completing a design discussion, or finishing any meaningful work.
---

# APAM Update - Write Session Memory

Capture what was learned, built, or decided in this session and write it to APAM memory.

## Steps

### 1. Get the project_id

Run `/apam:apam-status` or run `apam status` in the current repository. Copy the 16-character hex string from the `Project:` line exactly.

If you already resolved the `project_id` earlier this session and are certain it came from this same repository, you can reuse it.

### 2. Review what happened this session

Look back at this conversation. Identify:
- What was implemented, designed, or changed
- What decisions were made (architecture, patterns, tools chosen)
- What files were significantly touched
- What problems were found and solved
- What patterns or conventions were established or confirmed
- What plans were discussed (even if not yet built)
- Any new facts about the project structure that were not in memory before

### 3. Update L1 atoms

L1 is not immutable. Atoms must stay accurate.

Pin new atoms for any project fact not already covered:
- New endpoint, module, service, or dependency
- New constraint or rule established
- New confirmed decision about the project

Update existing atoms if this session changed something they describe:
- A tool was renamed, added, or removed -> update the tools atom
- The folder structure changed -> update the structure atom
- The stack changed -> update the stack atom
- An old constraint was lifted or a new one added -> update the constraint atom

To update, call `apam_pin` with the corrected full content. The upsert deduplicates on type+content+scope, so write the full corrected fact, not just the delta.

One fact per atom. Do not combine multiple facts into one atom.

### 4. Update L3 Project Intelligence

For every significant thing learned or decided, call `apam_update_intelligence`:

| What happened | Type | Suggested title |
|---|---|---|
| Architecture or system design discussed | `architecture` | "System Overview", "Auth Design", etc. |
| New module, service, or API designed | `entity` | "API Endpoints", "Key Modules", etc. |
| Bug pattern or fix approach noted | `pattern` | "Error Handling", "Known Issues" |
| How-to knowledge established | `procedural` | "How to Run Tests", "Deploy Process" |
| Future plan or enhancement discussed | `architecture` | "Future Plans" |

Upsert works. If a record with that title already exists, it will be updated. Use consistent titles so records update rather than multiply.

### 5. Write an L2 episode

Call `apam_write_episode` with:
- `project_id`: the exact value you copied in step 1
- `session_start` and `session_end`: approximate ISO timestamps for this session
- `git_branch`: current branch if you know it
- `summary`: 2-4 sentences on what was done and why
- `decisions`: key choices made
- `files_touched`: files significantly changed
- `problems_solved`: bugs or blockers cleared
- `patterns_observed`: anything recurring that was noted

Write multiple episodes if multiple distinct chunks of work were done.

### 6. Report what was written

Briefly tell the user what was saved: how many L1 atoms were pinned, which L3 records were updated, and whether an episode was written.
