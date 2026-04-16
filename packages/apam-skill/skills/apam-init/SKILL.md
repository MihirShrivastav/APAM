---
name: apam-init
description: Initialize APAM memory for a new project. Explores the codebase and writes L1 atoms and L3 Project Intelligence records so future sessions start with full context.
---

# APAM Init — Bootstrap Project Memory

You are setting up APAM memory for a project that has little or no memory recorded. Explore the codebase, learn its shape, and write an initial memory snapshot.

## Steps

### 1. Load existing memory

Call `apam_status` with **no arguments**. Copy the `project_id` from the `Project:` line exactly.

Call `apam_recall` with that `project_id`. Note what already exists — do not re-write facts already in L1.

### 2. Explore the project

Read enough to answer these questions:
- What does this project do? (README, package.json description, main file)
- What language, framework, and key libraries does it use?
- What is the folder structure? (top-level dirs, where src/tests/config live)
- What are the entry points? (main file, CLI command, server start)
- What APIs or endpoints exist, if any?
- What database or data layer is used, if any?
- What external services does it integrate with?
- Are there any stated constraints or rules? (linting, testing, deployment)

Do not read every file — scan strategically. `package.json`, `README.md`, top-level folder listing, and a few key source files is usually enough.

### 3. Pin L1 atoms

For each fact you learn, pin one atom per fact using `apam_pin` (scope: `project`, confidence: `claude_inferred`):

1. What this project is — one sentence
2. Tech stack: languages, frameworks, key libraries
3. Key folder structure — where things live
4. Entry points — main file, CLI, or server command
5. APIs/endpoints — names and one-line purpose each (if applicable)
6. Database/data layer — what DB, what main models (if applicable)
7. Key external services or integrations (if applicable)
8. Any constraints or rules ("always use tabs", "do not commit .env")

**One fact per atom.** Do not write compound atoms. Skip categories that genuinely don't apply.

### 4. Write L3 Project Intelligence records

Write at least:
- `apam_update_intelligence(type='architecture', title='System Overview', content='...')` — what the system is and how it is structured
- `apam_update_intelligence(type='entity', title='Key Modules', content='...')` — what the main modules/dirs do
- Any other records that capture important structure (e.g. "API Endpoints", "Database Schema")

### 5. Report what was written

Tell the user:
- Project ID detected
- How many L1 atoms were pinned
- What L3 records were created
- What was skipped (e.g. "no database found, skipped DB atom")
- Invite them to correct anything that looks wrong
