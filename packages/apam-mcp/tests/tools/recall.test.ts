import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema.js';
import { pinAtom } from '../../src/layers/l1.js';
import { writeEpisode } from '../../src/layers/l2.js';
import { upsertCard } from '../../src/layers/l3.js';
import { handleRecall } from '../../src/tools/recall.js';

describe('handleRecall', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('returns no-memory message for empty project', () => {
    const result = handleRecall(db, 'proj-1');
    expect(result).toContain('new project');
  });

  it('includes L1 atoms in output', () => {
    pinAtom(db, {
      type: 'preference',
      scope: 'global',
      project_id: null,
      content: 'be concise',
      confidence: 'user_confirmed',
      salience: 0.9,
      source_episode_id: null,
      source_agent: 'claude-code',
    });
    const result = handleRecall(db, 'proj-1');
    expect(result).toContain('be concise');
    expect(result).toContain('Fast Recall');
  });

  it('includes L3 cards in output', () => {
    upsertCard(db, {
      type: 'architecture',
      project_id: 'proj-1',
      title: 'Key Decisions',
      content: '- use postgres',
      source_episode_ids: [],
      created_by_agent: 'codex',
      updated_by_agent: 'codex',
    });
    const result = handleRecall(db, 'proj-1');
    expect(result).toContain('Key Decisions');
    expect(result).toContain('use postgres');
  });

  it('includes recent episodes in output', () => {
    writeEpisode(db, {
      project_id: 'proj-1',
      session_start: '2026-04-01T09:00:00Z',
      session_end: '2026-04-01T10:00:00Z',
      git_branch: 'main',
      git_commit_before: '',
      git_commit_after: '',
      files_touched: [],
      summary: 'refactored auth module',
      decisions: [],
      problems_solved: [],
      patterns_observed: [],
      agent_name: 'codex',
    });
    const result = handleRecall(db, 'proj-1');
    expect(result).toContain('refactored auth module');
    expect(result).toContain('agent:codex');
  });
});
