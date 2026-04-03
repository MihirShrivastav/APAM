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
    const result = handlePin(db, { type: 'preference', content: 'use tabs', scope: 'global', confidence: 'user_confirmed' });
    expect(result).toContain('Pinned');
    expect(getAtomsForRecall(db, 'any-project')).toHaveLength(1);
  });

  it('deduplicates on second pin of same content', () => {
    handlePin(db, { type: 'preference', content: 'use tabs', scope: 'global', confidence: 'user_confirmed' });
    handlePin(db, { type: 'preference', content: 'use tabs', scope: 'global', confidence: 'claude_inferred' });
    expect(getAtomsForRecall(db, 'any-project')).toHaveLength(1);
  });
});
