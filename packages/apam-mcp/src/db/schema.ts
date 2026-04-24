import type Database from 'better-sqlite3';

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(tableName) as { name?: string } | undefined;
  return row?.name === tableName;
}

function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  return columns.some(column => column.name === columnName);
}

function getTableSql(db: Database.Database, tableName: string): string {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?")
    .get(tableName) as { sql?: string } | undefined;
  return row?.sql ?? '';
}

function createL1Table(db: Database.Database, tableName: string): void {
  db.exec(`
    CREATE TABLE ${tableName} (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('preference','decision','constraint','commitment')),
      scope TEXT NOT NULL CHECK(scope IN ('global','project')),
      project_id TEXT,
      content TEXT NOT NULL,
      confidence TEXT NOT NULL CHECK(confidence IN ('user_confirmed','agent_inferred')),
      salience REAL NOT NULL DEFAULT 0.7,
      source_episode_id TEXT,
      source_agent TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

function createL2Table(db: Database.Database, tableName: string): void {
  db.exec(`
    CREATE TABLE ${tableName} (
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
      agent_name TEXT NOT NULL DEFAULT 'unknown',
      consolidated INTEGER NOT NULL DEFAULT 0
    )
  `);
}

function createL3Table(db: Database.Database, tableName: string): void {
  db.exec(`
    CREATE TABLE ${tableName} (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('architecture','procedural','pattern','entity')),
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_episode_ids TEXT NOT NULL DEFAULT '[]',
      created_by_agent TEXT NOT NULL DEFAULT 'unknown',
      updated_by_agent TEXT NOT NULL DEFAULT 'unknown',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, title, type)
    )
  `);
}

function migrateL1Table(db: Database.Database): void {
  if (!tableExists(db, 'l1_atoms')) {
    createL1Table(db, 'l1_atoms');
    return;
  }

  const needsRebuild =
    !columnExists(db, 'l1_atoms', 'source_agent') ||
    getTableSql(db, 'l1_atoms').includes('claude_inferred');

  if (!needsRebuild) return;

  db.exec('ALTER TABLE l1_atoms RENAME TO l1_atoms_legacy');
  createL1Table(db, 'l1_atoms');
  db.exec(`
    INSERT INTO l1_atoms (
      id, type, scope, project_id, content, confidence, salience,
      source_episode_id, source_agent, created_at, updated_at
    )
    SELECT
      id,
      type,
      scope,
      project_id,
      content,
      CASE confidence
        WHEN 'claude_inferred' THEN 'agent_inferred'
        ELSE confidence
      END,
      salience,
      source_episode_id,
      'claude-code',
      created_at,
      updated_at
    FROM l1_atoms_legacy
  `);
  db.exec('DROP TABLE l1_atoms_legacy');
}

function migrateL2Table(db: Database.Database): void {
  if (!tableExists(db, 'l2_episodes')) {
    createL2Table(db, 'l2_episodes');
    return;
  }

  if (columnExists(db, 'l2_episodes', 'agent_name')) return;

  db.exec('ALTER TABLE l2_episodes RENAME TO l2_episodes_legacy');
  createL2Table(db, 'l2_episodes');
  db.exec(`
    INSERT INTO l2_episodes (
      id, project_id, session_start, session_end, git_branch, git_commit_before,
      git_commit_after, files_touched, summary, decisions, problems_solved,
      patterns_observed, agent_name, consolidated
    )
    SELECT
      id,
      project_id,
      session_start,
      session_end,
      git_branch,
      git_commit_before,
      git_commit_after,
      files_touched,
      summary,
      decisions,
      problems_solved,
      patterns_observed,
      'claude-code',
      consolidated
    FROM l2_episodes_legacy
  `);
  db.exec('DROP TABLE l2_episodes_legacy');
}

function migrateL3Table(db: Database.Database): void {
  if (!tableExists(db, 'l3_cards')) {
    createL3Table(db, 'l3_cards');
    return;
  }

  const needsRebuild =
    !columnExists(db, 'l3_cards', 'created_by_agent') ||
    !columnExists(db, 'l3_cards', 'updated_by_agent');

  if (!needsRebuild) return;

  db.exec('ALTER TABLE l3_cards RENAME TO l3_cards_legacy');
  createL3Table(db, 'l3_cards');
  db.exec(`
    INSERT INTO l3_cards (
      id, type, project_id, title, content, source_episode_ids,
      created_by_agent, updated_by_agent, version, created_at, updated_at
    )
    SELECT
      id,
      type,
      project_id,
      title,
      content,
      source_episode_ids,
      'claude-code',
      'claude-code',
      version,
      created_at,
      updated_at
    FROM l3_cards_legacy
  `);
  db.exec('DROP TABLE l3_cards_legacy');
}

function createSessionsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      context_loaded INTEGER NOT NULL DEFAULT 0
    )
  `);
}

function createIndexes(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_l1_atoms_project_id ON l1_atoms(project_id);
    CREATE INDEX IF NOT EXISTS idx_l1_atoms_scope ON l1_atoms(scope);
    CREATE INDEX IF NOT EXISTS idx_l2_episodes_project_id ON l2_episodes(project_id);
    CREATE INDEX IF NOT EXISTS idx_l2_episodes_consolidated ON l2_episodes(consolidated);
    CREATE INDEX IF NOT EXISTS idx_l3_cards_project_id ON l3_cards(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
  `);
}

export function runMigrations(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrateL1Table(db);
  migrateL2Table(db);
  migrateL3Table(db);
  createSessionsTable(db);
  createIndexes(db);
}
