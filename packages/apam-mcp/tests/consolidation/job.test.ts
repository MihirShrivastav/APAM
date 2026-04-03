import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema.js';
import { writeEpisode } from '../../src/layers/l2.js';
import { getCardsForProject } from '../../src/layers/l3.js';
import { runConsolidation, shouldConsolidate, CONSOLIDATION_THRESHOLD } from '../../src/consolidation/job.js';

function makeEpisode(db: Database.Database, overrides: Partial<Parameters<typeof writeEpisode>[1]> = {}) {
  return writeEpisode(db, {
    project_id: 'proj-1',
    session_start: '2026-04-01T09:00:00Z',
    session_end: '2026-04-01T10:00:00Z',
    git_branch: 'main',
    git_commit_before: 'abc',
    git_commit_after: 'def',
    files_touched: ['src/index.ts'],
    summary: 'did some work',
    decisions: [],
    problems_solved: [],
    patterns_observed: [],
    ...overrides,
  });
}

describe('consolidation job', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it(`shouldConsolidate returns false below threshold`, () => {
    for (let i = 0; i < CONSOLIDATION_THRESHOLD - 1; i++) makeEpisode(db);
    expect(shouldConsolidate(db, 'proj-1')).toBe(false);
  });

  it(`shouldConsolidate returns true at threshold`, () => {
    for (let i = 0; i < CONSOLIDATION_THRESHOLD; i++) makeEpisode(db);
    expect(shouldConsolidate(db, 'proj-1')).toBe(true);
  });

  it('creates architecture card from decisions', () => {
    makeEpisode(db, { decisions: ['use postgres', 'monorepo structure'] });
    makeEpisode(db, { decisions: ['use JWT for auth'] });
    const { episodesProcessed } = runConsolidation(db, 'proj-1');
    expect(episodesProcessed).toBe(2);
    const cards = getCardsForProject(db, 'proj-1');
    const archCard = cards.find(c => c.type === 'architecture');
    expect(archCard).toBeDefined();
    expect(archCard!.content).toContain('use postgres');
    expect(archCard!.content).toContain('use JWT for auth');
  });

  it('marks all processed episodes as consolidated', () => {
    makeEpisode(db, { decisions: ['decision A'] });
    makeEpisode(db, { patterns_observed: ['pattern B'] });
    runConsolidation(db, 'proj-1');
    const remaining = db
      .prepare('SELECT COUNT(*) as c FROM l2_episodes WHERE consolidated = 0')
      .get() as { c: number };
    expect(remaining.c).toBe(0);
  });

  it('returns zero processed when no unconsolidated episodes', () => {
    const result = runConsolidation(db, 'proj-1');
    expect(result.episodesProcessed).toBe(0);
  });

  it('upserts existing cards on second consolidation run', () => {
    makeEpisode(db, { decisions: ['decision A'] });
    runConsolidation(db, 'proj-1');
    makeEpisode(db, { decisions: ['decision B'] });
    runConsolidation(db, 'proj-1');
    const cards = getCardsForProject(db, 'proj-1');
    const archCard = cards.find(c => c.type === 'architecture');
    expect(archCard!.version).toBe(2);
    expect(archCard!.content).toContain('decision A');
    expect(archCard!.content).toContain('decision B');
  });
});
