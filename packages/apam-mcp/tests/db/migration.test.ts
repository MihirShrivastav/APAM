import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema.js';

describe('database migrations', () => {
  it('upgrades legacy schema to provenance-aware tables', () => {
    const db = new Database(':memory:');

    db.exec(`
      CREATE TABLE l1_atoms (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('preference','decision','constraint','commitment')),
        scope TEXT NOT NULL CHECK(scope IN ('global','project')),
        project_id TEXT,
        content TEXT NOT NULL,
        confidence TEXT NOT NULL CHECK(confidence IN ('user_confirmed','claude_inferred')),
        salience REAL NOT NULL DEFAULT 0.7,
        source_episode_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE l2_episodes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        session_start TEXT NOT NULL,
        session_end TEXT NOT NULL,
        git_branch TEXT NOT NULL DEFAULT '',
        git_commit_before TEXT NOT NULL DEFAULT '',
        git_commit_after TEXT NOT NULL DEFAULT '',
        files_touched TEXT NOT NULL DEFAULT '[]',
        summary TEXT NOT NULL DEFAULT '',
        decisions TEXT NOT NULL DEFAULT '[]',
        problems_solved TEXT NOT NULL DEFAULT '[]',
        patterns_observed TEXT NOT NULL DEFAULT '[]',
        consolidated INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE l3_cards (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('architecture','procedural','pattern','entity')),
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        source_episode_ids TEXT NOT NULL DEFAULT '[]',
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, title, type)
      );
    `);

    db.prepare(`
      INSERT INTO l1_atoms (id, type, scope, project_id, content, confidence, salience, source_episode_id, created_at, updated_at)
      VALUES ('l1-1', 'decision', 'project', 'proj-1', 'legacy fact', 'claude_inferred', 0.7, NULL, '2026-04-01', '2026-04-01')
    `).run();
    db.prepare(`
      INSERT INTO l2_episodes (id, project_id, session_start, session_end, git_branch, git_commit_before, git_commit_after, files_touched, summary, decisions, problems_solved, patterns_observed, consolidated)
      VALUES ('l2-1', 'proj-1', '2026-04-01', '2026-04-01', 'main', '', '', '[]', 'legacy episode', '[]', '[]', '[]', 0)
    `).run();
    db.prepare(`
      INSERT INTO l3_cards (id, type, project_id, title, content, source_episode_ids, version, created_at, updated_at)
      VALUES ('l3-1', 'architecture', 'proj-1', 'System Overview', 'legacy card', '[]', 1, '2026-04-01', '2026-04-01')
    `).run();

    runMigrations(db);

    const atom = db
      .prepare('SELECT confidence, source_agent FROM l1_atoms WHERE id = ?')
      .get('l1-1') as { confidence: string; source_agent: string };
    expect(atom.confidence).toBe('agent_inferred');
    expect(atom.source_agent).toBe('claude-code');

    const episode = db
      .prepare('SELECT agent_name FROM l2_episodes WHERE id = ?')
      .get('l2-1') as { agent_name: string };
    expect(episode.agent_name).toBe('claude-code');

    const card = db
      .prepare('SELECT created_by_agent, updated_by_agent FROM l3_cards WHERE id = ?')
      .get('l3-1') as { created_by_agent: string; updated_by_agent: string };
    expect(card.created_by_agent).toBe('claude-code');
    expect(card.updated_by_agent).toBe('claude-code');
  });
});
