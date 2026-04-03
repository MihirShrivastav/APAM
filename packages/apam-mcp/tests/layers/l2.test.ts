import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema.js';
import {
  writeEpisode,
  getRecentEpisodes,
  getUnconsolidatedEpisodes,
  countUnconsolidated,
  markConsolidated,
} from '../../src/layers/l2.js';

describe('L2 layer', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('writes and retrieves an episode with JSON arrays parsed', () => {
    writeEpisode(db, {
      project_id: 'proj-1',
      session_start: '2026-04-01T09:00:00Z',
      session_end: '2026-04-01T10:00:00Z',
      git_branch: 'main',
      git_commit_before: 'abc',
      git_commit_after: 'def',
      files_touched: ['src/auth.ts', 'tests/auth.test.ts'],
      summary: 'Added JWT auth',
      decisions: ['use JWT over sessions'],
      problems_solved: ['fixed token expiry bug'],
      patterns_observed: ['always co-locate tests'],
    });

    const episodes = getRecentEpisodes(db, 'proj-1', 2);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].files_touched).toEqual(['src/auth.ts', 'tests/auth.test.ts']);
    expect(episodes[0].decisions).toEqual(['use JWT over sessions']);
    expect(episodes[0].consolidated).toBe(false);
  });

  it('counts unconsolidated episodes', () => {
    for (let i = 0; i < 3; i++) {
      writeEpisode(db, {
        project_id: 'proj-1',
        session_start: `2026-04-0${i + 1}T09:00:00Z`,
        session_end: `2026-04-0${i + 1}T10:00:00Z`,
        git_branch: 'main', git_commit_before: '', git_commit_after: '',
        files_touched: [], summary: `session ${i}`,
        decisions: [], problems_solved: [], patterns_observed: [],
      });
    }
    expect(countUnconsolidated(db, 'proj-1')).toBe(3);
  });

  it('markConsolidated sets consolidated = true on all provided ids', () => {
    const ep1 = writeEpisode(db, { project_id: 'proj-1', session_start: '2026-04-01T09:00:00Z', session_end: '2026-04-01T10:00:00Z', git_branch: 'main', git_commit_before: '', git_commit_after: '', files_touched: [], summary: 'ep1', decisions: [], problems_solved: [], patterns_observed: [] });
    const ep2 = writeEpisode(db, { project_id: 'proj-1', session_start: '2026-04-02T09:00:00Z', session_end: '2026-04-02T10:00:00Z', git_branch: 'main', git_commit_before: '', git_commit_after: '', files_touched: [], summary: 'ep2', decisions: [], problems_solved: [], patterns_observed: [] });

    markConsolidated(db, [ep1.id, ep2.id]);

    expect(countUnconsolidated(db, 'proj-1')).toBe(0);
    expect(getUnconsolidatedEpisodes(db, 'proj-1')).toHaveLength(0);
  });
});
