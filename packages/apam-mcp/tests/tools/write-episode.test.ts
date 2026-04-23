import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema.js';
import { handleWriteEpisode } from '../../src/tools/write-episode.js';
import { countUnconsolidated, getRecentEpisodes } from '../../src/layers/l2.js';

describe('handleWriteEpisode', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('writes episode and returns confirmation', () => {
    const result = handleWriteEpisode(db, 'proj-1', {
      session_start: '2026-04-01T09:00:00Z',
      session_end: '2026-04-01T10:00:00Z',
      git_branch: 'main',
      git_commit_before: 'abc',
      git_commit_after: 'def',
      files_touched: ['src/auth.ts'],
      summary: 'added auth',
      decisions: ['use JWT'],
      problems_solved: [],
      patterns_observed: [],
      agent_name: 'codex',
    });
    expect(result).toContain('Episode recorded');
    expect(countUnconsolidated(db, 'proj-1')).toBe(1);
    expect(getRecentEpisodes(db, 'proj-1', 1)[0].agent_name).toBe('codex');
  });

  it('defaults agent_name to unknown when omitted', () => {
    handleWriteEpisode(db, 'proj-2', {
      session_start: '2026-04-01T09:00:00Z',
      session_end: '2026-04-01T10:00:00Z',
      git_branch: 'main',
      git_commit_before: '',
      git_commit_after: '',
      files_touched: [],
      summary: 'captured fallback details',
      decisions: [],
      problems_solved: [],
      patterns_observed: [],
    });
    expect(getRecentEpisodes(db, 'proj-2', 1)[0].agent_name).toBe('unknown');
  });
});
