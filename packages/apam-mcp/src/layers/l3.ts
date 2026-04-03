import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export type L3Type = 'architecture' | 'procedural' | 'pattern' | 'entity';

export interface L3Card {
  id: string;
  type: L3Type;
  project_id: string;
  title: string;
  content: string;
  source_episode_ids: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

interface L3Row extends Omit<L3Card, 'source_episode_ids'> {
  source_episode_ids: string;
}

function rowToCard(row: L3Row): L3Card {
  return { ...row, source_episode_ids: JSON.parse(row.source_episode_ids) };
}

export function upsertCard(
  db: Database.Database,
  card: Omit<L3Card, 'id' | 'version' | 'created_at' | 'updated_at'>
): L3Card {
  const now = new Date().toISOString();
  const existing = db
    .prepare(
      'SELECT * FROM l3_cards WHERE project_id = ? AND title = ? AND type = ?'
    )
    .get(card.project_id, card.title, card.type) as L3Row | undefined;

  if (existing) {
    const existingIds: string[] = JSON.parse(existing.source_episode_ids);
    const mergedIds = [...new Set([...existingIds, ...card.source_episode_ids])];
    db.prepare(
      'UPDATE l3_cards SET content = ?, source_episode_ids = ?, version = version + 1, updated_at = ? WHERE id = ?'
    ).run(card.content, JSON.stringify(mergedIds), now, existing.id);
    return rowToCard(
      db.prepare('SELECT * FROM l3_cards WHERE id = ?').get(existing.id) as L3Row
    );
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO l3_cards
      (id, type, project_id, title, content, source_episode_ids, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id, card.type, card.project_id, card.title, card.content,
    JSON.stringify(card.source_episode_ids), now, now
  );
  return rowToCard(db.prepare('SELECT * FROM l3_cards WHERE id = ?').get(id) as L3Row);
}

export function getCardsForProject(db: Database.Database, projectId: string): L3Card[] {
  const rows = db
    .prepare('SELECT * FROM l3_cards WHERE project_id = ? ORDER BY type, title')
    .all(projectId) as L3Row[];
  return rows.map(rowToCard);
}

export function deleteCard(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM l3_cards WHERE id = ?').run(id);
  return result.changes > 0;
}
