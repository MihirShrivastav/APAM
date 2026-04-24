import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema.js';
import { upsertCard, getCardsForProject, deleteCard } from '../../src/layers/l3.js';

describe('L3 layer', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('creates a new card', () => {
    upsertCard(db, {
      type: 'architecture',
      project_id: 'proj-1',
      title: 'Key Decisions',
      content: '- use postgres\n- monorepo',
      source_episode_ids: ['ep-1'],
      created_by_agent: 'codex',
      updated_by_agent: 'codex',
    });
    const cards = getCardsForProject(db, 'proj-1');
    expect(cards).toHaveLength(1);
    expect(cards[0].version).toBe(1);
    expect(cards[0].source_episode_ids).toEqual(['ep-1']);
    expect(cards[0].created_by_agent).toBe('codex');
  });

  it('upserts existing card and increments version', () => {
    upsertCard(db, {
      type: 'pattern',
      project_id: 'proj-1',
      title: 'Observed Patterns',
      content: '- co-locate tests',
      source_episode_ids: ['ep-1'],
      created_by_agent: 'claude-code',
      updated_by_agent: 'claude-code',
    });
    upsertCard(db, {
      type: 'pattern',
      project_id: 'proj-1',
      title: 'Observed Patterns',
      content: '- co-locate tests\n- prefer small files',
      source_episode_ids: ['ep-2'],
      created_by_agent: 'codex',
      updated_by_agent: 'codex',
    });

    const cards = getCardsForProject(db, 'proj-1');
    expect(cards).toHaveLength(1);
    expect(cards[0].version).toBe(2);
    expect(cards[0].source_episode_ids).toEqual(['ep-1', 'ep-2']);
    expect(cards[0].content).toContain('prefer small files');
    expect(cards[0].updated_by_agent).toBe('codex');
  });

  it('does not mix cards from different projects', () => {
    upsertCard(db, {
      type: 'architecture',
      project_id: 'proj-1',
      title: 'A',
      content: 'x',
      source_episode_ids: [],
      created_by_agent: 'codex',
      updated_by_agent: 'codex',
    });
    upsertCard(db, {
      type: 'architecture',
      project_id: 'proj-2',
      title: 'B',
      content: 'y',
      source_episode_ids: [],
      created_by_agent: 'codex',
      updated_by_agent: 'codex',
    });
    expect(getCardsForProject(db, 'proj-1')).toHaveLength(1);
  });

  it('deletes a card by id', () => {
    const card = upsertCard(db, {
      type: 'entity',
      project_id: 'proj-1',
      title: 'Module: src',
      content: 'x',
      source_episode_ids: [],
      created_by_agent: 'codex',
      updated_by_agent: 'codex',
    });
    expect(deleteCard(db, card.id)).toBe(true);
    expect(getCardsForProject(db, 'proj-1')).toHaveLength(0);
  });
});
