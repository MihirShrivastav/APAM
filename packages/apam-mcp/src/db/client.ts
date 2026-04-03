import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { runMigrations } from './schema.js';

export function getDb(projectId: string): Database.Database {
  const dir = join(homedir(), '.apam', projectId);
  mkdirSync(dir, { recursive: true });
  const db = new Database(join(dir, 'apam.db'));
  runMigrations(db);
  return db;
}
