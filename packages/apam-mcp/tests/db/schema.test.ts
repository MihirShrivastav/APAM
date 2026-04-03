import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema.js';

describe('runMigrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  it('creates all three layer tables', () => {
    runMigrations(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('l1_atoms');
    expect(names).toContain('l2_episodes');
    expect(names).toContain('l3_cards');
  });

  it('is idempotent — running twice does not throw', () => {
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
  });

  it('enforces type constraint on l1_atoms', () => {
    runMigrations(db);
    expect(() =>
      db.prepare("INSERT INTO l1_atoms (id, type, scope, content, confidence, salience, created_at, updated_at) VALUES ('1','invalid','global','x','user_confirmed',0.5,'2026-01-01','2026-01-01')").run()
    ).toThrow();
  });
});
