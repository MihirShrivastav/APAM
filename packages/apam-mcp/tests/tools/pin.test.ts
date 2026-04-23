import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema.js';
import { handlePin } from '../../src/tools/pin.js';
import { getAtomsForRecall } from '../../src/layers/l1.js';

describe('handlePin', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('pins a fact and confirms in return message', () => {
    const result = handlePin(db, {
      type: 'preference',
      content: 'use tabs',
      scope: 'global',
      confidence: 'user_confirmed',
      agent_name: 'codex',
    });
    expect(result).toContain('Pinned');
    expect(result).toContain('codex');
    expect(getAtomsForRecall(db, 'any-project')).toHaveLength(1);
  });

  it('deduplicates on second pin of same content', () => {
    handlePin(db, {
      type: 'preference',
      content: 'use tabs',
      scope: 'global',
      confidence: 'user_confirmed',
      agent_name: 'claude-code',
    });
    handlePin(db, {
      type: 'preference',
      content: 'use tabs',
      scope: 'global',
      confidence: 'agent_inferred',
      agent_name: 'codex',
    });
    expect(getAtomsForRecall(db, 'any-project')).toHaveLength(1);
  });

  it('defaults source agent to unknown when omitted', () => {
    handlePin(db, {
      type: 'decision',
      content: 'use sqlite',
      scope: 'project',
      confidence: 'agent_inferred',
      project_id: 'proj-1',
    });
    expect(getAtomsForRecall(db, 'proj-1')[0].source_agent).toBe('unknown');
  });
});
