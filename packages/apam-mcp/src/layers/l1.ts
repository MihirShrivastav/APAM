import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export type L1Type = 'preference' | 'decision' | 'constraint' | 'commitment';
export type L1Scope = 'global' | 'project';
export type L1Confidence = 'user_confirmed' | 'claude_inferred';

export interface L1Atom {
  id: string;
  type: L1Type;
  scope: L1Scope;
  project_id: string | null;
  content: string;
  confidence: L1Confidence;
  salience: number;
  source_episode_id: string | null;
  created_at: string;
  updated_at: string;
}

export function pinAtom(
  db: Database.Database,
  atom: Omit<L1Atom, 'id' | 'created_at' | 'updated_at'>
): L1Atom {
  const now = new Date().toISOString();
  const existing = db
    .prepare(
      `SELECT id FROM l1_atoms
       WHERE type = ? AND content = ? AND scope = ?
       AND (project_id IS ? OR project_id = ?)`
    )
    .get(atom.type, atom.content, atom.scope, atom.project_id, atom.project_id) as
    | { id: string }
    | undefined;

  if (existing) {
    db.prepare(
      `UPDATE l1_atoms SET confidence = ?, salience = ?, updated_at = ? WHERE id = ?`
    ).run(atom.confidence, atom.salience, now, existing.id);
    return db.prepare('SELECT * FROM l1_atoms WHERE id = ?').get(existing.id) as L1Atom;
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO l1_atoms
      (id, type, scope, project_id, content, confidence, salience, source_episode_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, atom.type, atom.scope, atom.project_id, atom.content, atom.confidence, atom.salience, atom.source_episode_id, now, now);
  return db.prepare('SELECT * FROM l1_atoms WHERE id = ?').get(id) as L1Atom;
}

export function getAtomsForRecall(db: Database.Database, projectId: string): L1Atom[] {
  return db
    .prepare(
      `SELECT * FROM l1_atoms
       WHERE scope = 'global' OR (scope = 'project' AND project_id = ?)
       ORDER BY salience DESC`
    )
    .all(projectId) as L1Atom[];
}

export function evictStaleAtoms(db: Database.Database, projectId: string): number {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const result = db
    .prepare(
      `DELETE FROM l1_atoms
       WHERE scope = 'project' AND project_id = ? AND salience < 0.2 AND updated_at < ?`
    )
    .run(projectId, cutoff);
  return result.changes;
}
