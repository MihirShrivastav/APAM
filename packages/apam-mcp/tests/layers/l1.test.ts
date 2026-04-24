import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema.js';
import { pinAtom, getAtomsForRecall, evictStaleAtoms } from '../../src/layers/l1.js';

describe('L1 layer', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('pins an atom and retrieves it', () => {
    pinAtom(db, {
      type: 'preference',
      scope: 'global',
      project_id: null,
      content: 'prefer concise responses',
      confidence: 'user_confirmed',
      salience: 0.9,
      source_episode_id: null,
      source_agent: 'codex',
    });
    const atoms = getAtomsForRecall(db, 'proj-123');
    expect(atoms).toHaveLength(1);
    expect(atoms[0].content).toBe('prefer concise responses');
    expect(atoms[0].source_agent).toBe('codex');
  });

  it('deduplicates atoms with same type and content', () => {
    const base = {
      type: 'preference' as const,
      scope: 'global' as const,
      project_id: null,
      content: 'use tabs',
      confidence: 'user_confirmed' as const,
      salience: 0.7,
      source_episode_id: null,
      source_agent: 'claude-code',
    };
    pinAtom(db, base);
    pinAtom(db, { ...base, confidence: 'agent_inferred', source_agent: 'codex' });
    const atoms = getAtomsForRecall(db, 'proj-123');
    expect(atoms).toHaveLength(1);
    expect(atoms[0].confidence).toBe('agent_inferred');
  });

  it('returns both global and project-scoped atoms for the project', () => {
    pinAtom(db, {
      type: 'preference',
      scope: 'global',
      project_id: null,
      content: 'global pref',
      confidence: 'user_confirmed',
      salience: 0.8,
      source_episode_id: null,
      source_agent: 'claude-code',
    });
    pinAtom(db, {
      type: 'decision',
      scope: 'project',
      project_id: 'proj-abc',
      content: 'use postgres',
      confidence: 'user_confirmed',
      salience: 0.8,
      source_episode_id: null,
      source_agent: 'codex',
    });
    pinAtom(db, {
      type: 'decision',
      scope: 'project',
      project_id: 'proj-xyz',
      content: 'use mysql',
      confidence: 'user_confirmed',
      salience: 0.8,
      source_episode_id: null,
      source_agent: 'codex',
    });

    const atoms = getAtomsForRecall(db, 'proj-abc');
    expect(atoms).toHaveLength(2);
    expect(atoms.map(atom => atom.content)).toContain('global pref');
    expect(atoms.map(atom => atom.content)).toContain('use postgres');
    expect(atoms.map(atom => atom.content)).not.toContain('use mysql');
  });

  it('evicts stale low-salience project atoms', () => {
    const staleDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO l1_atoms (
        id, type, scope, project_id, content, confidence, salience, source_episode_id, source_agent, created_at, updated_at
      )
      VALUES ('stale-1', 'decision', 'project', 'proj-abc', 'old thing', 'agent_inferred', 0.1, NULL, 'claude-code', ?, ?)
    `).run(staleDate, staleDate);

    const evicted = evictStaleAtoms(db, 'proj-abc');
    expect(evicted).toBe(1);
    expect(getAtomsForRecall(db, 'proj-abc')).toHaveLength(0);
  });
});
