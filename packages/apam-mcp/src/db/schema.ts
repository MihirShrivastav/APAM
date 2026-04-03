import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS l1_atoms (
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

    CREATE TABLE IF NOT EXISTS l2_episodes (
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

    CREATE TABLE IF NOT EXISTS l3_cards (
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

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      context_loaded INTEGER NOT NULL DEFAULT 0
    );
  `);
}
