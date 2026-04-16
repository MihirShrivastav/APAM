---
name: apam-consolidate
description: Manually trigger APAM consolidation — distills unconsolidated L2 episodes into L3 Project Intelligence records. Run when apam_status shows several unconsolidated episodes.
---

# APAM Consolidate — Distill Episodes into Project Intelligence

Trigger manual L2→L3 consolidation to extract durable knowledge from recent session episodes.

## When to use

- `apam_status` shows 2+ unconsolidated L2 episodes and you want to distil them now
- After a big batch of work sessions before starting something new
- When you want L3 records updated from episode history without waiting for the threshold

## Steps

1. Call `apam_status` with **no arguments**. Copy the `project_id` from the `Project:` line.
2. Note the unconsolidated episode count from the status output.
3. Call `apam_consolidate` with that `project_id`.
4. Report the result: how many cards were created or updated, what topics were distilled.

## Note on L3 writes

Consolidation extracts patterns from episode history — it is a background enrichment path. For knowledge you have right now (a design decision, a new module), use `apam_update_intelligence` directly (or run `/apam:apam-update`). Do not wait for consolidation when you can write directly.
