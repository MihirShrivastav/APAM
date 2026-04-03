# APAM for Claude Code — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first MCP server + Superpowers skill that gives Claude Code persistent, self-maintaining layered memory (L1 fast recall, L2 episodes, L3 semantic cards) across sessions.

**Architecture:** TypeScript MCP server with a SQLite backend (`better-sqlite3`), five MCP tools, three layer modules, a rule-based consolidation job, hook commands for session automation, and a Superpowers skill that provides the cognitive policy. The codebase itself is L4 — no replication needed.

**Tech Stack:** Node.js 18+, TypeScript 5, `@modelcontextprotocol/sdk`, `better-sqlite3`, `zod`, `vitest`, `tsup`

---

## File Structure

```
packages/
├── apam-mcp/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsup.config.ts
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── server.ts                    # MCP server entry — registers tools, starts stdio transport
│   │   ├── cli.ts                       # CLI entry — apam init|status|consolidate|forget
│   │   ├── hooks/
│   │   │   ├── load-context.ts          # apam-load-context binary (PreToolUse hook)
│   │   │   └── write-episode.ts         # apam-write-episode binary (Stop hook fallback)
│   │   ├── db/
│   │   │   ├── schema.ts                # SQLite DDL + runMigrations()
│   │   │   └── client.ts                # getDb(projectId) factory
│   │   ├── layers/
│   │   │   ├── l1.ts                    # pinAtom, getAtomsForRecall, evictStaleAtoms
│   │   │   ├── l2.ts                    # writeEpisode, getRecentEpisodes, getUnconsolidated, markConsolidated
│   │   │   └── l3.ts                    # upsertCard, getCardsForProject, deleteCard
│   │   ├── tools/
│   │   │   ├── recall.ts                # handleRecall — assembles L1+L2+L3 context string
│   │   │   ├── pin.ts                   # handlePin — writes L1 atom with dedup
│   │   │   ├── write-episode.ts         # handleWriteEpisode — writes L2, triggers consolidation check
│   │   │   ├── consolidate.ts           # handleConsolidate — runs consolidation job
│   │   │   └── status.ts                # handleStatus — returns memory health snapshot
│   │   ├── consolidation/
│   │   │   └── job.ts                   # runConsolidation, shouldConsolidate
│   │   └── utils/
│   │       ├── project-id.ts            # getProjectId(cwd), getProjectLabel(cwd)
│   │       └── git.ts                   # getGitContext(sessionStartCommit?), getCurrentCommit()
│   └── tests/
│       ├── db/schema.test.ts
│       ├── layers/l1.test.ts
│       ├── layers/l2.test.ts
│       ├── layers/l3.test.ts
│       ├── tools/recall.test.ts
│       ├── tools/pin.test.ts
│       ├── tools/write-episode.test.ts
│       ├── consolidation/job.test.ts
│       └── utils/project-id.test.ts
└── apam-skill/
    └── skill.md                         # Superpowers skill — cognitive policy for Claude
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `packages/apam-mcp/package.json`
- Create: `packages/apam-mcp/tsconfig.json`
- Create: `packages/apam-mcp/tsup.config.ts`
- Create: `packages/apam-mcp/vitest.config.ts`

- [ ] **Step 1: Create the packages directory**

```bash
mkdir -p packages/apam-mcp/src/db packages/apam-mcp/src/layers packages/apam-mcp/src/tools packages/apam-mcp/src/consolidation packages/apam-mcp/src/utils packages/apam-mcp/src/hooks packages/apam-mcp/tests/db packages/apam-mcp/tests/layers packages/apam-mcp/tests/tools packages/apam-mcp/tests/consolidation packages/apam-mcp/tests/utils packages/apam-skill
```

- [ ] **Step 2: Write `packages/apam-mcp/package.json`**

```json
{
  "name": "apam-mcp",
  "version": "0.1.0",
  "description": "APAM Memory MCP Server for Claude Code",
  "type": "module",
  "bin": {
    "apam-mcp": "./dist/server.js",
    "apam": "./dist/cli.js",
    "apam-load-context": "./dist/hooks/load-context.js",
    "apam-write-episode": "./dist/hooks/write-episode.js"
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsx src/server.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "better-sqlite3": "^9.4.3",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Write `packages/apam-mcp/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Write `packages/apam-mcp/tsup.config.ts`**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    cli: 'src/cli.ts',
    'hooks/load-context': 'src/hooks/load-context.ts',
    'hooks/write-episode': 'src/hooks/write-episode.ts',
  },
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
```

- [ ] **Step 5: Write `packages/apam-mcp/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [ ] **Step 6: Install dependencies**

```bash
cd packages/apam-mcp && npm install
```

Expected: `node_modules` directory created, no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/apam-mcp/package.json packages/apam-mcp/tsconfig.json packages/apam-mcp/tsup.config.ts packages/apam-mcp/vitest.config.ts
git commit -m "feat: scaffold apam-mcp package"
```

---

## Task 2: Database Schema + Client

**Files:**
- Create: `packages/apam-mcp/src/db/schema.ts`
- Create: `packages/apam-mcp/src/db/client.ts`
- Create: `packages/apam-mcp/tests/db/schema.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/apam-mcp/tests/db/schema.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/apam-mcp && npm test -- tests/db/schema.test.ts
```

Expected: FAIL — `Cannot find module '../../src/db/schema.js'`

- [ ] **Step 3: Write `packages/apam-mcp/src/db/schema.ts`**

```typescript
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
```

- [ ] **Step 4: Write `packages/apam-mcp/src/db/client.ts`**

```typescript
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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/apam-mcp && npm test -- tests/db/schema.test.ts
```

Expected: PASS — 3 tests passing.

- [ ] **Step 6: Commit**

```bash
git add packages/apam-mcp/src/db/ packages/apam-mcp/tests/db/
git commit -m "feat: database schema and client"
```

---

## Task 3: L1 Layer Operations

**Files:**
- Create: `packages/apam-mcp/src/layers/l1.ts`
- Create: `packages/apam-mcp/tests/layers/l1.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/apam-mcp/tests/layers/l1.test.ts`:
```typescript
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
    });
    const atoms = getAtomsForRecall(db, 'proj-123');
    expect(atoms).toHaveLength(1);
    expect(atoms[0].content).toBe('prefer concise responses');
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
    };
    pinAtom(db, base);
    pinAtom(db, { ...base, confidence: 'claude_inferred' });
    const atoms = getAtomsForRecall(db, 'proj-123');
    expect(atoms).toHaveLength(1);
  });

  it('returns both global and project-scoped atoms for the project', () => {
    pinAtom(db, { type: 'preference', scope: 'global', project_id: null, content: 'global pref', confidence: 'user_confirmed', salience: 0.8, source_episode_id: null });
    pinAtom(db, { type: 'decision', scope: 'project', project_id: 'proj-abc', content: 'use postgres', confidence: 'user_confirmed', salience: 0.8, source_episode_id: null });
    pinAtom(db, { type: 'decision', scope: 'project', project_id: 'proj-xyz', content: 'use mysql', confidence: 'user_confirmed', salience: 0.8, source_episode_id: null });

    const atoms = getAtomsForRecall(db, 'proj-abc');
    expect(atoms).toHaveLength(2);
    expect(atoms.map(a => a.content)).toContain('global pref');
    expect(atoms.map(a => a.content)).toContain('use postgres');
    expect(atoms.map(a => a.content)).not.toContain('use mysql');
  });

  it('evicts stale low-salience project atoms', () => {
    const staleDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO l1_atoms (id, type, scope, project_id, content, confidence, salience, created_at, updated_at)
      VALUES ('stale-1', 'decision', 'project', 'proj-abc', 'old thing', 'claude_inferred', 0.1, ?, ?)
    `).run(staleDate, staleDate);

    const evicted = evictStaleAtoms(db, 'proj-abc');
    expect(evicted).toBe(1);
    expect(getAtomsForRecall(db, 'proj-abc')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/apam-mcp && npm test -- tests/layers/l1.test.ts
```

Expected: FAIL — `Cannot find module '../../src/layers/l1.js'`

- [ ] **Step 3: Write `packages/apam-mcp/src/layers/l1.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/apam-mcp && npm test -- tests/layers/l1.test.ts
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/apam-mcp/src/layers/l1.ts packages/apam-mcp/tests/layers/l1.test.ts
git commit -m "feat: L1 fast recall layer operations"
```

---

## Task 4: L2 Layer Operations

**Files:**
- Create: `packages/apam-mcp/src/layers/l2.ts`
- Create: `packages/apam-mcp/tests/layers/l2.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/apam-mcp/tests/layers/l2.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema.js';
import {
  writeEpisode,
  getRecentEpisodes,
  getUnconsolidatedEpisodes,
  countUnconsolidated,
  markConsolidated,
} from '../../src/layers/l2.js';

describe('L2 layer', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('writes and retrieves an episode with JSON arrays parsed', () => {
    writeEpisode(db, {
      project_id: 'proj-1',
      session_start: '2026-04-01T09:00:00Z',
      session_end: '2026-04-01T10:00:00Z',
      git_branch: 'main',
      git_commit_before: 'abc',
      git_commit_after: 'def',
      files_touched: ['src/auth.ts', 'tests/auth.test.ts'],
      summary: 'Added JWT auth',
      decisions: ['use JWT over sessions'],
      problems_solved: ['fixed token expiry bug'],
      patterns_observed: ['always co-locate tests'],
    });

    const episodes = getRecentEpisodes(db, 'proj-1', 2);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].files_touched).toEqual(['src/auth.ts', 'tests/auth.test.ts']);
    expect(episodes[0].decisions).toEqual(['use JWT over sessions']);
    expect(episodes[0].consolidated).toBe(false);
  });

  it('counts unconsolidated episodes', () => {
    for (let i = 0; i < 3; i++) {
      writeEpisode(db, {
        project_id: 'proj-1',
        session_start: `2026-04-0${i + 1}T09:00:00Z`,
        session_end: `2026-04-0${i + 1}T10:00:00Z`,
        git_branch: 'main', git_commit_before: '', git_commit_after: '',
        files_touched: [], summary: `session ${i}`,
        decisions: [], problems_solved: [], patterns_observed: [],
      });
    }
    expect(countUnconsolidated(db, 'proj-1')).toBe(3);
  });

  it('markConsolidated sets consolidated = true on all provided ids', () => {
    const ep1 = writeEpisode(db, { project_id: 'proj-1', session_start: '2026-04-01T09:00:00Z', session_end: '2026-04-01T10:00:00Z', git_branch: 'main', git_commit_before: '', git_commit_after: '', files_touched: [], summary: 'ep1', decisions: [], problems_solved: [], patterns_observed: [] });
    const ep2 = writeEpisode(db, { project_id: 'proj-1', session_start: '2026-04-02T09:00:00Z', session_end: '2026-04-02T10:00:00Z', git_branch: 'main', git_commit_before: '', git_commit_after: '', files_touched: [], summary: 'ep2', decisions: [], problems_solved: [], patterns_observed: [] });

    markConsolidated(db, [ep1.id, ep2.id]);

    expect(countUnconsolidated(db, 'proj-1')).toBe(0);
    expect(getUnconsolidatedEpisodes(db, 'proj-1')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/apam-mcp && npm test -- tests/layers/l2.test.ts
```

Expected: FAIL — `Cannot find module '../../src/layers/l2.js'`

- [ ] **Step 3: Write `packages/apam-mcp/src/layers/l2.ts`**

```typescript
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface L2Episode {
  id: string;
  project_id: string;
  session_start: string;
  session_end: string;
  git_branch: string;
  git_commit_before: string;
  git_commit_after: string;
  files_touched: string[];
  summary: string;
  decisions: string[];
  problems_solved: string[];
  patterns_observed: string[];
  consolidated: boolean;
}

interface L2Row
  extends Omit<
    L2Episode,
    'files_touched' | 'decisions' | 'problems_solved' | 'patterns_observed' | 'consolidated'
  > {
  files_touched: string;
  decisions: string;
  problems_solved: string;
  patterns_observed: string;
  consolidated: number;
}

function rowToEpisode(row: L2Row): L2Episode {
  return {
    ...row,
    files_touched: JSON.parse(row.files_touched),
    decisions: JSON.parse(row.decisions),
    problems_solved: JSON.parse(row.problems_solved),
    patterns_observed: JSON.parse(row.patterns_observed),
    consolidated: row.consolidated === 1,
  };
}

export function writeEpisode(
  db: Database.Database,
  episode: Omit<L2Episode, 'id' | 'consolidated'>
): L2Episode {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO l2_episodes
      (id, project_id, session_start, session_end, git_branch, git_commit_before,
       git_commit_after, files_touched, summary, decisions, problems_solved, patterns_observed, consolidated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    id,
    episode.project_id,
    episode.session_start,
    episode.session_end,
    episode.git_branch,
    episode.git_commit_before,
    episode.git_commit_after,
    JSON.stringify(episode.files_touched),
    episode.summary,
    JSON.stringify(episode.decisions),
    JSON.stringify(episode.problems_solved),
    JSON.stringify(episode.patterns_observed)
  );
  return { ...episode, id, consolidated: false };
}

export function getRecentEpisodes(
  db: Database.Database,
  projectId: string,
  limit = 2
): L2Episode[] {
  const rows = db
    .prepare(
      'SELECT * FROM l2_episodes WHERE project_id = ? ORDER BY session_end DESC LIMIT ?'
    )
    .all(projectId, limit) as L2Row[];
  return rows.map(rowToEpisode);
}

export function getUnconsolidatedEpisodes(
  db: Database.Database,
  projectId: string
): L2Episode[] {
  const rows = db
    .prepare(
      'SELECT * FROM l2_episodes WHERE project_id = ? AND consolidated = 0 ORDER BY session_end ASC'
    )
    .all(projectId) as L2Row[];
  return rows.map(rowToEpisode);
}

export function countUnconsolidated(db: Database.Database, projectId: string): number {
  const row = db
    .prepare(
      'SELECT COUNT(*) as count FROM l2_episodes WHERE project_id = ? AND consolidated = 0'
    )
    .get(projectId) as { count: number };
  return row.count;
}

export function markConsolidated(db: Database.Database, episodeIds: string[]): void {
  const stmt = db.prepare('UPDATE l2_episodes SET consolidated = 1 WHERE id = ?');
  const tx = db.transaction((ids: string[]) => {
    for (const id of ids) stmt.run(id);
  });
  tx(episodeIds);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/apam-mcp && npm test -- tests/layers/l2.test.ts
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/apam-mcp/src/layers/l2.ts packages/apam-mcp/tests/layers/l2.test.ts
git commit -m "feat: L2 episode layer operations"
```

---

## Task 5: L3 Layer Operations

**Files:**
- Create: `packages/apam-mcp/src/layers/l3.ts`
- Create: `packages/apam-mcp/tests/layers/l3.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/apam-mcp/tests/layers/l3.test.ts`:
```typescript
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
    });
    const cards = getCardsForProject(db, 'proj-1');
    expect(cards).toHaveLength(1);
    expect(cards[0].version).toBe(1);
    expect(cards[0].source_episode_ids).toEqual(['ep-1']);
  });

  it('upserts existing card — merges episode ids and increments version', () => {
    upsertCard(db, {
      type: 'pattern',
      project_id: 'proj-1',
      title: 'Observed Patterns',
      content: '- co-locate tests',
      source_episode_ids: ['ep-1'],
    });
    upsertCard(db, {
      type: 'pattern',
      project_id: 'proj-1',
      title: 'Observed Patterns',
      content: '- co-locate tests\n- prefer small files',
      source_episode_ids: ['ep-2'],
    });

    const cards = getCardsForProject(db, 'proj-1');
    expect(cards).toHaveLength(1);
    expect(cards[0].version).toBe(2);
    expect(cards[0].source_episode_ids).toEqual(['ep-1', 'ep-2']);
    expect(cards[0].content).toContain('prefer small files');
  });

  it('does not mix cards from different projects', () => {
    upsertCard(db, { type: 'architecture', project_id: 'proj-1', title: 'A', content: 'x', source_episode_ids: [] });
    upsertCard(db, { type: 'architecture', project_id: 'proj-2', title: 'B', content: 'y', source_episode_ids: [] });
    expect(getCardsForProject(db, 'proj-1')).toHaveLength(1);
  });

  it('deletes a card by id', () => {
    const card = upsertCard(db, { type: 'entity', project_id: 'proj-1', title: 'Module: src', content: 'x', source_episode_ids: [] });
    expect(deleteCard(db, card.id)).toBe(true);
    expect(getCardsForProject(db, 'proj-1')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/apam-mcp && npm test -- tests/layers/l3.test.ts
```

Expected: FAIL — `Cannot find module '../../src/layers/l3.js'`

- [ ] **Step 3: Write `packages/apam-mcp/src/layers/l3.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/apam-mcp && npm test -- tests/layers/l3.test.ts
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/apam-mcp/src/layers/l3.ts packages/apam-mcp/tests/layers/l3.test.ts
git commit -m "feat: L3 semantic card layer operations"
```

---

## Task 6: Utility Functions

**Files:**
- Create: `packages/apam-mcp/src/utils/project-id.ts`
- Create: `packages/apam-mcp/src/utils/git.ts`
- Create: `packages/apam-mcp/tests/utils/project-id.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/apam-mcp/tests/utils/project-id.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getProjectId } from '../../src/utils/project-id.js';

describe('getProjectId', () => {
  it('returns a 16-char hex string', () => {
    const id = getProjectId(process.cwd());
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns the same id for the same directory', () => {
    expect(getProjectId(process.cwd())).toBe(getProjectId(process.cwd()));
  });

  it('returns different ids for different directories', () => {
    expect(getProjectId('/tmp/project-a')).not.toBe(getProjectId('/tmp/project-b'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/apam-mcp && npm test -- tests/utils/project-id.test.ts
```

Expected: FAIL — `Cannot find module '../../src/utils/project-id.js'`

- [ ] **Step 3: Write `packages/apam-mcp/src/utils/project-id.ts`**

```typescript
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { resolve } from 'path';

export function getProjectId(cwd = process.cwd()): string {
  try {
    const remote = execSync('git remote get-url origin', {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const normalized = remote
      .replace(/^(https?:\/\/|git@|ssh:\/\/)/, '')
      .replace(/\.git$/, '')
      .replace(/\/$/, '');
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  } catch {
    return createHash('sha256').update(resolve(cwd)).digest('hex').slice(0, 16);
  }
}

export function getProjectLabel(cwd = process.cwd()): string {
  try {
    const remote = execSync('git remote get-url origin', {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return remote.split('/').pop()?.replace(/\.git$/, '') ?? cwd.split(/[/\\]/).pop() ?? 'unknown';
  } catch {
    return cwd.split(/[/\\]/).pop() ?? 'unknown';
  }
}
```

- [ ] **Step 4: Write `packages/apam-mcp/src/utils/git.ts`**

```typescript
import { execSync } from 'child_process';

export interface GitContext {
  branch: string;
  commitBefore: string;
  commitAfter: string;
  filesTouched: string[];
}

export function getCurrentCommit(cwd = process.cwd()): string {
  try {
    return execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

export function getGitContext(
  sessionStartCommit?: string,
  cwd = process.cwd()
): GitContext {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const commitAfter = getCurrentCommit(cwd);
    const commitBefore = sessionStartCommit || commitAfter;

    let filesTouched: string[] = [];
    if (commitBefore && commitAfter && commitBefore !== commitAfter) {
      const diff = execSync(`git diff --name-only ${commitBefore}..${commitAfter}`, {
        encoding: 'utf8',
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      filesTouched = diff.trim().split('\n').filter(Boolean);
    }

    return { branch, commitBefore, commitAfter, filesTouched };
  } catch {
    return { branch: 'unknown', commitBefore: '', commitAfter: '', filesTouched: [] };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/apam-mcp && npm test -- tests/utils/project-id.test.ts
```

Expected: PASS — 3 tests passing.

- [ ] **Step 6: Commit**

```bash
git add packages/apam-mcp/src/utils/ packages/apam-mcp/tests/utils/
git commit -m "feat: project ID derivation and git context utilities"
```

---

## Task 7: Consolidation Job

**Files:**
- Create: `packages/apam-mcp/src/consolidation/job.ts`
- Create: `packages/apam-mcp/tests/consolidation/job.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/apam-mcp/tests/consolidation/job.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema.js';
import { writeEpisode } from '../../src/layers/l2.js';
import { getCardsForProject } from '../../src/layers/l3.js';
import { runConsolidation, shouldConsolidate, CONSOLIDATION_THRESHOLD } from '../../src/consolidation/job.js';

function makeEpisode(db: Database.Database, overrides: Partial<Parameters<typeof writeEpisode>[1]> = {}) {
  return writeEpisode(db, {
    project_id: 'proj-1',
    session_start: '2026-04-01T09:00:00Z',
    session_end: '2026-04-01T10:00:00Z',
    git_branch: 'main',
    git_commit_before: 'abc',
    git_commit_after: 'def',
    files_touched: ['src/index.ts'],
    summary: 'did some work',
    decisions: [],
    problems_solved: [],
    patterns_observed: [],
    ...overrides,
  });
}

describe('consolidation job', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it(`shouldConsolidate returns false below threshold`, () => {
    for (let i = 0; i < CONSOLIDATION_THRESHOLD - 1; i++) makeEpisode(db);
    expect(shouldConsolidate(db, 'proj-1')).toBe(false);
  });

  it(`shouldConsolidate returns true at threshold`, () => {
    for (let i = 0; i < CONSOLIDATION_THRESHOLD; i++) makeEpisode(db);
    expect(shouldConsolidate(db, 'proj-1')).toBe(true);
  });

  it('creates architecture card from decisions', () => {
    makeEpisode(db, { decisions: ['use postgres', 'monorepo structure'] });
    makeEpisode(db, { decisions: ['use JWT for auth'] });
    const { episodesProcessed } = runConsolidation(db, 'proj-1');
    expect(episodesProcessed).toBe(2);
    const cards = getCardsForProject(db, 'proj-1');
    const archCard = cards.find(c => c.type === 'architecture');
    expect(archCard).toBeDefined();
    expect(archCard!.content).toContain('use postgres');
    expect(archCard!.content).toContain('use JWT for auth');
  });

  it('marks all processed episodes as consolidated', () => {
    makeEpisode(db, { decisions: ['decision A'] });
    makeEpisode(db, { patterns_observed: ['pattern B'] });
    runConsolidation(db, 'proj-1');
    const remaining = db
      .prepare('SELECT COUNT(*) as c FROM l2_episodes WHERE consolidated = 0')
      .get() as { c: number };
    expect(remaining.c).toBe(0);
  });

  it('returns zero processed when no unconsolidated episodes', () => {
    const result = runConsolidation(db, 'proj-1');
    expect(result.episodesProcessed).toBe(0);
  });

  it('upserts existing cards on second consolidation run', () => {
    makeEpisode(db, { decisions: ['decision A'] });
    runConsolidation(db, 'proj-1');
    makeEpisode(db, { decisions: ['decision B'] });
    runConsolidation(db, 'proj-1');
    const cards = getCardsForProject(db, 'proj-1');
    const archCard = cards.find(c => c.type === 'architecture');
    expect(archCard!.version).toBe(2);
    expect(archCard!.content).toContain('decision A');
    expect(archCard!.content).toContain('decision B');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/apam-mcp && npm test -- tests/consolidation/job.test.ts
```

Expected: FAIL — `Cannot find module '../../src/consolidation/job.js'`

- [ ] **Step 3: Write `packages/apam-mcp/src/consolidation/job.ts`**

```typescript
import type Database from 'better-sqlite3';
import { getUnconsolidatedEpisodes, countUnconsolidated, markConsolidated } from '../layers/l2.js';
import { upsertCard } from '../layers/l3.js';

export const CONSOLIDATION_THRESHOLD = 5;

export function shouldConsolidate(db: Database.Database, projectId: string): boolean {
  return countUnconsolidated(db, projectId) >= CONSOLIDATION_THRESHOLD;
}

export interface ConsolidationResult {
  episodesProcessed: number;
  cardsCreated: number;
  cardsUpdated: number;
}

export function runConsolidation(
  db: Database.Database,
  projectId: string
): ConsolidationResult {
  const episodes = getUnconsolidatedEpisodes(db, projectId);
  if (episodes.length === 0) return { episodesProcessed: 0, cardsCreated: 0, cardsUpdated: 0 };

  const episodeIds = episodes.map(e => e.id);
  const countBefore = (
    db.prepare('SELECT COUNT(*) as c FROM l3_cards WHERE project_id = ?').get(projectId) as { c: number }
  ).c;

  // Decisions → architecture card
  const allDecisions = episodes.flatMap(e => e.decisions).filter(Boolean);
  if (allDecisions.length > 0) {
    upsertCard(db, {
      type: 'architecture',
      project_id: projectId,
      title: 'Key Decisions',
      content: allDecisions.map(d => `- ${d}`).join('\n'),
      source_episode_ids: episodeIds,
    });
  }

  // Patterns → pattern card
  const allPatterns = episodes.flatMap(e => e.patterns_observed).filter(Boolean);
  if (allPatterns.length > 0) {
    upsertCard(db, {
      type: 'pattern',
      project_id: projectId,
      title: 'Observed Patterns',
      content: allPatterns.map(p => `- ${p}`).join('\n'),
      source_episode_ids: episodeIds,
    });
  }

  // Problems solved → procedural card
  const allProblems = episodes.flatMap(e => e.problems_solved).filter(Boolean);
  if (allProblems.length > 0) {
    upsertCard(db, {
      type: 'procedural',
      project_id: projectId,
      title: 'Problems Solved',
      content: allProblems.map(p => `- ${p}`).join('\n'),
      source_episode_ids: episodeIds,
    });
  }

  // Frequently touched top-level directories → entity cards
  const dirCount: Record<string, number> = {};
  for (const ep of episodes) {
    for (const file of ep.files_touched) {
      const topDir = file.split('/')[0] || file;
      dirCount[topDir] = (dirCount[topDir] ?? 0) + 1;
    }
  }
  const topDirs = Object.entries(dirCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .filter(([, count]) => count >= 2);

  for (const [dir] of topDirs) {
    const relevant = episodes.filter(e => e.files_touched.some(f => f.startsWith(dir)));
    const summaries = relevant.map(e => e.summary).filter(Boolean);
    if (summaries.length > 0) {
      upsertCard(db, {
        type: 'entity',
        project_id: projectId,
        title: `Module: ${dir}`,
        content: `Frequently modified. Recent activity:\n${summaries
          .slice(-3)
          .map(s => `- ${s}`)
          .join('\n')}`,
        source_episode_ids: relevant.map(e => e.id),
      });
    }
  }

  markConsolidated(db, episodeIds);

  const countAfter = (
    db.prepare('SELECT COUNT(*) as c FROM l3_cards WHERE project_id = ?').get(projectId) as { c: number }
  ).c;

  return {
    episodesProcessed: episodes.length,
    cardsCreated: Math.max(0, countAfter - countBefore),
    cardsUpdated: Math.max(0, countBefore - (countBefore - (countAfter - countBefore))),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/apam-mcp && npm test -- tests/consolidation/job.test.ts
```

Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/apam-mcp/src/consolidation/ packages/apam-mcp/tests/consolidation/
git commit -m "feat: consolidation job — L2 episodes to L3 cards"
```

---

## Task 8: MCP Tool Handlers

**Files:**
- Create: `packages/apam-mcp/src/tools/recall.ts`
- Create: `packages/apam-mcp/src/tools/pin.ts`
- Create: `packages/apam-mcp/src/tools/write-episode.ts`
- Create: `packages/apam-mcp/src/tools/consolidate.ts`
- Create: `packages/apam-mcp/src/tools/status.ts`
- Create: `packages/apam-mcp/tests/tools/recall.test.ts`
- Create: `packages/apam-mcp/tests/tools/pin.test.ts`
- Create: `packages/apam-mcp/tests/tools/write-episode.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/apam-mcp/tests/tools/recall.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema.js';
import { pinAtom } from '../../src/layers/l1.js';
import { writeEpisode } from '../../src/layers/l2.js';
import { upsertCard } from '../../src/layers/l3.js';
import { handleRecall } from '../../src/tools/recall.js';

describe('handleRecall', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('returns no-memory message for empty project', () => {
    const result = handleRecall(db, 'proj-1');
    expect(result).toContain('new project');
  });

  it('includes L1 atoms in output', () => {
    pinAtom(db, { type: 'preference', scope: 'global', project_id: null, content: 'be concise', confidence: 'user_confirmed', salience: 0.9, source_episode_id: null });
    const result = handleRecall(db, 'proj-1');
    expect(result).toContain('be concise');
    expect(result).toContain('Fast Recall');
  });

  it('includes L3 cards in output', () => {
    upsertCard(db, { type: 'architecture', project_id: 'proj-1', title: 'Key Decisions', content: '- use postgres', source_episode_ids: [] });
    const result = handleRecall(db, 'proj-1');
    expect(result).toContain('Key Decisions');
    expect(result).toContain('use postgres');
  });

  it('includes recent episodes in output', () => {
    writeEpisode(db, { project_id: 'proj-1', session_start: '2026-04-01T09:00:00Z', session_end: '2026-04-01T10:00:00Z', git_branch: 'main', git_commit_before: '', git_commit_after: '', files_touched: [], summary: 'refactored auth module', decisions: [], problems_solved: [], patterns_observed: [] });
    const result = handleRecall(db, 'proj-1');
    expect(result).toContain('refactored auth module');
  });
});
```

`packages/apam-mcp/tests/tools/pin.test.ts`:
```typescript
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
```

`packages/apam-mcp/tests/tools/write-episode.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/schema.js';
import { handleWriteEpisode } from '../../src/tools/write-episode.js';
import { countUnconsolidated } from '../../src/layers/l2.js';

describe('handleWriteEpisode', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('writes episode and returns confirmation', () => {
    const result = handleWriteEpisode(db, 'proj-1', {
      session_start: '2026-04-01T09:00:00Z',
      session_end: '2026-04-01T10:00:00Z',
      git_branch: 'main',
      git_commit_before: 'abc',
      git_commit_after: 'def',
      files_touched: ['src/auth.ts'],
      summary: 'added auth',
      decisions: ['use JWT'],
      problems_solved: [],
      patterns_observed: [],
    });
    expect(result).toContain('Episode recorded');
    expect(countUnconsolidated(db, 'proj-1')).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/apam-mcp && npm test -- tests/tools/
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Write `packages/apam-mcp/src/tools/recall.ts`**

```typescript
import type Database from 'better-sqlite3';
import { getAtomsForRecall, evictStaleAtoms } from '../layers/l1.js';
import { getRecentEpisodes } from '../layers/l2.js';
import { getCardsForProject } from '../layers/l3.js';

export function handleRecall(db: Database.Database, projectId: string): string {
  evictStaleAtoms(db, projectId);

  const l1Atoms = getAtomsForRecall(db, projectId);
  const recentEpisodes = getRecentEpisodes(db, projectId, 2);
  const l3Cards = getCardsForProject(db, projectId);

  const sections: string[] = [];

  if (l1Atoms.length > 0) {
    const lines = l1Atoms.map(a => `[${a.type}] ${a.content}`).join('\n');
    sections.push(`## Fast Recall (L1)\n${lines}`);
  }

  if (l3Cards.length > 0) {
    const cards = l3Cards
      .map(c => `### ${c.title} (${c.type})\n${c.content}`)
      .join('\n\n');
    sections.push(`## Project Knowledge (L3)\n${cards}`);
  }

  if (recentEpisodes.length > 0) {
    const lines = recentEpisodes
      .map(e => `[${e.session_end.slice(0, 10)}] branch:${e.git_branch} — ${e.summary || 'no summary'}`)
      .join('\n');
    sections.push(`## Recent Sessions (L2)\n${lines}`);
  }

  if (sections.length === 0) {
    return 'No memory found for this project. This appears to be a new project.';
  }

  return sections.join('\n\n');
}
```

- [ ] **Step 4: Write `packages/apam-mcp/src/tools/pin.ts`**

```typescript
import type Database from 'better-sqlite3';
import { pinAtom, type L1Type, type L1Scope, type L1Confidence } from '../layers/l1.js';

interface PinInput {
  type: L1Type;
  content: string;
  scope: L1Scope;
  confidence: L1Confidence;
  project_id?: string;
  source_episode_id?: string;
  salience?: number;
}

export function handlePin(db: Database.Database, input: PinInput): string {
  const atom = pinAtom(db, {
    type: input.type,
    content: input.content,
    scope: input.scope,
    confidence: input.confidence,
    project_id: input.project_id ?? null,
    source_episode_id: input.source_episode_id ?? null,
    salience: input.salience ?? (input.confidence === 'user_confirmed' ? 0.9 : 0.7),
  });
  return `Pinned [${atom.type}/${atom.scope}]: "${atom.content}" (confidence: ${atom.confidence})`;
}
```

- [ ] **Step 5: Write `packages/apam-mcp/src/tools/write-episode.ts`**

```typescript
import type Database from 'better-sqlite3';
import { writeEpisode, countUnconsolidated } from '../layers/l2.js';
import { runConsolidation, CONSOLIDATION_THRESHOLD } from '../consolidation/job.js';
import type { L2Episode } from '../layers/l2.js';

type EpisodeInput = Omit<L2Episode, 'id' | 'consolidated' | 'project_id'>;

export function handleWriteEpisode(
  db: Database.Database,
  projectId: string,
  input: EpisodeInput
): string {
  writeEpisode(db, { ...input, project_id: projectId });

  const unconsolidated = countUnconsolidated(db, projectId);
  let consolidationMsg = '';

  if (unconsolidated >= CONSOLIDATION_THRESHOLD) {
    const result = runConsolidation(db, projectId);
    consolidationMsg = ` Auto-consolidated ${result.episodesProcessed} episodes into ${result.cardsCreated} new L3 cards.`;
  }

  return `Episode recorded for project ${projectId} (${unconsolidated} unconsolidated episodes remain).${consolidationMsg}`;
}
```

- [ ] **Step 6: Write `packages/apam-mcp/src/tools/consolidate.ts`**

```typescript
import type Database from 'better-sqlite3';
import { runConsolidation } from '../consolidation/job.js';

export function handleConsolidate(db: Database.Database, projectId: string): string {
  const result = runConsolidation(db, projectId);
  if (result.episodesProcessed === 0) {
    return 'Nothing to consolidate — no unconsolidated episodes found.';
  }
  return `Consolidated ${result.episodesProcessed} episodes. Created ${result.cardsCreated} new L3 cards, updated ${result.cardsUpdated} existing cards.`;
}
```

- [ ] **Step 7: Write `packages/apam-mcp/src/tools/status.ts`**

```typescript
import type Database from 'better-sqlite3';
import { CONSOLIDATION_THRESHOLD } from '../consolidation/job.js';

export function handleStatus(db: Database.Database, projectId?: string): string {
  const lines: string[] = ['## APAM Memory Status'];

  if (projectId) {
    const l1Count = (
      db.prepare("SELECT COUNT(*) as c FROM l1_atoms WHERE scope='global' OR (scope='project' AND project_id=?)").get(projectId) as { c: number }
    ).c;
    const l2Total = (
      db.prepare('SELECT COUNT(*) as c FROM l2_episodes WHERE project_id=?').get(projectId) as { c: number }
    ).c;
    const l2Unconsolidated = (
      db.prepare('SELECT COUNT(*) as c FROM l2_episodes WHERE project_id=? AND consolidated=0').get(projectId) as { c: number }
    ).c;
    const l3Count = (
      db.prepare('SELECT COUNT(*) as c FROM l3_cards WHERE project_id=?').get(projectId) as { c: number }
    ).c;
    const lastEp = db
      .prepare('SELECT session_end FROM l2_episodes WHERE project_id=? ORDER BY session_end DESC LIMIT 1')
      .get(projectId) as { session_end: string } | undefined;

    lines.push(`Project: ${projectId}`);
    lines.push(`L1 atoms (global + project): ${l1Count}`);
    lines.push(`L2 episodes: ${l2Total} total, ${l2Unconsolidated} unconsolidated`);
    lines.push(`L3 cards: ${l3Count}`);
    lines.push(`Next consolidation at: ${CONSOLIDATION_THRESHOLD} unconsolidated episodes (${CONSOLIDATION_THRESHOLD - l2Unconsolidated} more needed)`);
    lines.push(`Last session: ${lastEp?.session_end ?? 'none'}`);
  } else {
    const l1Global = (
      db.prepare("SELECT COUNT(*) as c FROM l1_atoms WHERE scope='global'").get() as { c: number }
    ).c;
    lines.push(`Global L1 atoms: ${l1Global}`);
  }

  return lines.join('\n');
}
```

- [ ] **Step 8: Run all tool tests to verify they pass**

```bash
cd packages/apam-mcp && npm test -- tests/tools/
```

Expected: PASS — all tool tests passing.

- [ ] **Step 9: Commit**

```bash
git add packages/apam-mcp/src/tools/ packages/apam-mcp/tests/tools/
git commit -m "feat: MCP tool handlers (recall, pin, write-episode, consolidate, status)"
```

---

## Task 9: MCP Server Entry Point

**Files:**
- Create: `packages/apam-mcp/src/server.ts`

- [ ] **Step 1: Write `packages/apam-mcp/src/server.ts`**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getDb } from './db/client.js';
import { handleRecall } from './tools/recall.js';
import { handlePin } from './tools/pin.js';
import { handleWriteEpisode } from './tools/write-episode.js';
import { handleConsolidate } from './tools/consolidate.js';
import { handleStatus } from './tools/status.js';

const server = new McpServer({
  name: 'apam-mcp',
  version: '0.1.0',
});

server.tool(
  'apam_recall',
  'Load project memory context (L1 fast recall + L3 semantic cards + recent sessions). Call this at the start of every session.',
  { project_id: z.string().describe('Project identifier derived from git remote or directory hash') },
  async ({ project_id }) => {
    const db = getDb(project_id);
    const content = handleRecall(db, project_id);
    return { content: [{ type: 'text', text: content }] };
  }
);

server.tool(
  'apam_pin',
  'Store a high-salience fact into L1 fast recall. Use for user preferences, architectural decisions, constraints, and commitments.',
  {
    type: z.enum(['preference', 'decision', 'constraint', 'commitment']),
    content: z.string().describe('Concise single-fact plain text'),
    scope: z.enum(['global', 'project']).describe('global = all projects, project = this repo only'),
    confidence: z.enum(['user_confirmed', 'claude_inferred']),
    project_id: z.string().optional().describe('Required when scope is project'),
    source_episode_id: z.string().optional(),
    salience: z.number().min(0).max(1).optional().describe('0.0–1.0, defaults to 0.9 for user_confirmed, 0.7 for claude_inferred'),
  },
  async (input) => {
    const projectId = input.project_id ?? 'global';
    const db = getDb(projectId);
    const content = handlePin(db, {
      type: input.type,
      content: input.content,
      scope: input.scope,
      confidence: input.confidence,
      project_id: input.project_id,
      source_episode_id: input.source_episode_id,
      salience: input.salience,
    });
    return { content: [{ type: 'text', text: content }] };
  }
);

server.tool(
  'apam_write_episode',
  'Record a session episode into L2 memory. Call before finishing the final response of a session. Automatically triggers L3 consolidation when threshold is reached.',
  {
    project_id: z.string(),
    session_start: z.string().describe('ISO 8601 timestamp'),
    session_end: z.string().describe('ISO 8601 timestamp'),
    git_branch: z.string().default(''),
    git_commit_before: z.string().default(''),
    git_commit_after: z.string().default(''),
    files_touched: z.array(z.string()).default([]),
    summary: z.string().describe('2–4 sentence description of what was accomplished'),
    decisions: z.array(z.string()).default([]).describe('Key architectural or technical choices made'),
    problems_solved: z.array(z.string()).default([]).describe('Bugs fixed or blockers cleared'),
    patterns_observed: z.array(z.string()).default([]).describe('Recurring approaches or style signals'),
  },
  async (input) => {
    const { project_id, ...episodeInput } = input;
    const db = getDb(project_id);
    const content = handleWriteEpisode(db, project_id, episodeInput);
    return { content: [{ type: 'text', text: content }] };
  }
);

server.tool(
  'apam_consolidate',
  'Manually trigger L3 consolidation — distills unconsolidated L2 episodes into semantic knowledge cards.',
  { project_id: z.string() },
  async ({ project_id }) => {
    const db = getDb(project_id);
    const content = handleConsolidate(db, project_id);
    return { content: [{ type: 'text', text: content }] };
  }
);

server.tool(
  'apam_status',
  'Show memory health snapshot: atom counts, unconsolidated episodes, last consolidation timestamp.',
  { project_id: z.string().optional() },
  async ({ project_id }) => {
    const db = getDb(project_id ?? 'global');
    const content = handleStatus(db, project_id);
    return { content: [{ type: 'text', text: content }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

- [ ] **Step 2: Build and verify no TypeScript errors**

```bash
cd packages/apam-mcp && npm run build
```

Expected: `dist/` directory created, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/apam-mcp/src/server.ts
git commit -m "feat: MCP server entry point with all five tools"
```

---

## Task 10: CLI Entry Point

**Files:**
- Create: `packages/apam-mcp/src/cli.ts`

- [ ] **Step 1: Write `packages/apam-mcp/src/cli.ts`**

```typescript
import { getDb } from './db/client.js';
import { getProjectId, getProjectLabel } from './utils/project-id.js';
import { handleConsolidate } from './tools/consolidate.js';
import { handleStatus } from './tools/status.js';
import { deleteCard } from './layers/l3.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const [, , command, ...args] = process.argv;

function getClaudeSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

function readSettings(): Record<string, unknown> {
  const path = getClaudeSettingsPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(settings: Record<string, unknown>): void {
  writeFileSync(getClaudeSettingsPath(), JSON.stringify(settings, null, 2));
}

switch (command) {
  case 'init': {
    const projectId = getProjectId();
    const label = getProjectLabel();
    console.log(`Initialising APAM for project: ${label} (${projectId})`);

    // Ensure DB is created
    getDb(projectId);

    // Configure hooks in Claude Code settings
    const settings = readSettings();
    const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};

    const loadContextHook = { type: 'command', command: 'apam-load-context' };
    const writeEpisodeHook = { type: 'command', command: 'apam-write-episode' };

    const preToolUse = (hooks['PreToolUse'] as { matcher: string; hooks: unknown[] }[]) ?? [];
    if (!preToolUse.some(h => JSON.stringify(h).includes('apam-load-context'))) {
      preToolUse.push({ matcher: '.*', hooks: [loadContextHook] });
    }

    const stopHooks = (hooks['Stop'] as { hooks: unknown[] }[]) ?? [];
    if (!stopHooks.some(h => JSON.stringify(h).includes('apam-write-episode'))) {
      stopHooks.push({ hooks: [writeEpisodeHook] });
    }

    settings.hooks = { ...hooks, PreToolUse: preToolUse, Stop: stopHooks };
    writeSettings(settings);

    console.log('Hooks configured in ~/.claude/settings.json');
    console.log('APAM initialised. Start the server with: npx apam-mcp');
    break;
  }

  case 'status': {
    const projectId = getProjectId();
    const db = getDb(projectId);
    console.log(handleStatus(db, projectId));
    break;
  }

  case 'consolidate': {
    const projectId = getProjectId();
    const db = getDb(projectId);
    console.log(handleConsolidate(db, projectId));
    break;
  }

  case 'forget': {
    const id = args[0];
    if (!id) {
      console.error('Usage: apam forget <card-id>');
      process.exit(1);
    }
    const projectId = getProjectId();
    const db = getDb(projectId);
    const deleted = deleteCard(db, id);
    console.log(deleted ? `Deleted card ${id}` : `Card ${id} not found`);
    break;
  }

  default:
    console.log(`APAM Memory CLI
Usage:
  apam init          Initialise APAM for this project and configure hooks
  apam status        Show memory health snapshot
  apam consolidate   Manually trigger L3 consolidation
  apam forget <id>   Delete an L3 card by ID
`);
}
```

- [ ] **Step 2: Build and verify**

```bash
cd packages/apam-mcp && npm run build
```

Expected: `dist/cli.js` created, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/apam-mcp/src/cli.ts
git commit -m "feat: CLI — init, status, consolidate, forget"
```

---

## Task 11: Hook Commands

**Files:**
- Create: `packages/apam-mcp/src/hooks/load-context.ts`
- Create: `packages/apam-mcp/src/hooks/write-episode.ts`

- [ ] **Step 1: Write `packages/apam-mcp/src/hooks/load-context.ts`**

This hook fires before every tool call. It ensures the server is accessible and outputs a reminder that Claude should call `apam_recall`. It exits 0 always — never blocks a session.

```typescript
import { getProjectId } from '../utils/project-id.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const projectId = getProjectId();
const dbPath = join(homedir(), '.apam', projectId, 'apam.db');

if (existsSync(dbPath)) {
  // Output a reminder that will be visible to Claude in the hook feedback
  process.stdout.write(
    JSON.stringify({
      type: 'apam_context_available',
      project_id: projectId,
      message: `APAM memory is available for project ${projectId}. If this is the start of a session, call apam_recall with project_id="${projectId}" to load memory context.`,
    }) + '\n'
  );
}

// Always exit 0 — never block a session
process.exit(0);
```

- [ ] **Step 2: Write `packages/apam-mcp/src/hooks/write-episode.ts`**

Fallback episode writer. Fires at session end. Writes a minimal git-only episode if Claude did not call `apam_write_episode` during the session. Checks for a recent episode within the last 10 minutes to avoid double-writing.

```typescript
import { getProjectId } from '../utils/project-id.js';
import { getGitContext } from '../utils/git.js';
import { getDb } from '../db/client.js';
import { getRecentEpisodes, writeEpisode } from '../layers/l2.js';

const projectId = getProjectId();
const db = getDb(projectId);
const now = new Date();

// Skip if Claude already wrote an episode in the last 10 minutes
const recent = getRecentEpisodes(db, projectId, 1);
if (recent.length > 0) {
  const lastEnd = new Date(recent[0].session_end);
  const minutesSince = (now.getTime() - lastEnd.getTime()) / 60000;
  if (minutesSince < 10) {
    process.exit(0);
  }
}

const git = getGitContext();
writeEpisode(db, {
  project_id: projectId,
  session_start: now.toISOString(),
  session_end: now.toISOString(),
  git_branch: git.branch,
  git_commit_before: git.commitBefore,
  git_commit_after: git.commitAfter,
  files_touched: git.filesTouched,
  summary: '',
  decisions: [],
  problems_solved: [],
  patterns_observed: [],
});

process.exit(0);
```

- [ ] **Step 3: Build and verify**

```bash
cd packages/apam-mcp && npm run build
```

Expected: `dist/hooks/load-context.js` and `dist/hooks/write-episode.js` created.

- [ ] **Step 4: Commit**

```bash
git add packages/apam-mcp/src/hooks/
git commit -m "feat: hook commands for session-start and session-end automation"
```

---

## Task 12: APAM Superpowers Skill

**Files:**
- Create: `packages/apam-skill/skill.md`

- [ ] **Step 1: Write `packages/apam-skill/skill.md`**

```markdown
---
name: apam
description: APAM Memory — gives Claude Code persistent, layered memory across sessions. Use at session start to load context, mid-session to pin facts, and before finishing to write an episode. Invoke whenever a new session begins or memory operations are needed.
---

# APAM Memory Skill

You have access to persistent layered memory via the APAM MCP server. This memory
persists across sessions so you never start blank. Follow this policy exactly.

## Session Start Protocol

At the very start of every new session (first response), call `apam_recall` with the
current project ID before doing anything else:

1. Derive the project ID by calling: `apam_status` (it will show the project context)
   OR use the project ID from the hook output if available in the conversation.
2. Call `apam_recall` with that project_id.
3. Read the returned context carefully — it contains:
   - **L1 Fast Recall**: user preferences, decisions, constraints, commitments
   - **L3 Project Knowledge**: architecture, patterns, procedures, key modules
   - **Recent Sessions**: what was worked on recently
4. Use this context to inform your behaviour for the entire session. Do not re-read
   files you already know the purpose of from L3 cards.

## Deriving the Project ID

The project ID is a 16-char hex string derived from the git remote URL (or directory
path). Get it by running:
```
apam_status
```
The output will include the project ID. Alternatively, if the `apam-load-context`
hook fired at session start, the project_id is in the hook output JSON.

## Mid-Session: When to Pin Facts (L1)

Call `apam_pin` when you learn something that should persist across sessions. Apply
this test before pinning: **will this change how I behave in a future session?**

Pin with `confidence: "user_confirmed"` when:
- The user explicitly says "remember this", "always do X", "never do Y"
- The user confirms a preference when asked
- A tech/architecture decision is explicitly agreed upon

Pin with `confidence: "claude_inferred"` when:
- You observe a consistent pattern the user hasn't stated explicitly
- A decision is made that will affect the architecture long-term
- A constraint is established (e.g., "we don't use mocks in tests")

**Do NOT pin:**
- Task details specific to this session
- Transient facts ("the build is currently failing")
- Things already in L3 cards

Use `scope: "global"` for user preferences that apply to all projects.
Use `scope: "project"` for project-specific decisions. Include `project_id`.

## Session End: Writing an Episode (L2)

Before your final response in a session where meaningful work was done, call
`apam_write_episode`. Include:

- **summary**: 2–4 sentences describing what was accomplished
- **decisions**: list of architectural or technical choices made (strings)
- **problems_solved**: bugs fixed, blockers cleared (strings)
- **patterns_observed**: recurring approaches you noticed (strings)
- **files_touched**: key files changed (you can list the most significant ones)
- **git_branch**: current branch (from git context if available)

A "meaningful session" is one where:
- Code was written or changed
- An architectural decision was made
- A bug was debugged and resolved
- A significant new approach was established

Skip `apam_write_episode` for very short sessions (< 5 minutes, single clarifying
question answered, no code written).

## Example Episode

```json
{
  "project_id": "a1b2c3d4e5f6a7b8",
  "session_start": "2026-04-03T09:00:00Z",
  "session_end": "2026-04-03T11:30:00Z",
  "git_branch": "feat/auth",
  "git_commit_before": "abc123",
  "git_commit_after": "def456",
  "files_touched": ["src/auth/jwt.ts", "tests/auth/jwt.test.ts"],
  "summary": "Implemented JWT authentication with refresh token rotation. Fixed a token expiry bug where clock skew caused false rejections. Added integration tests.",
  "decisions": ["use JWT over sessions for stateless auth", "15-minute access token TTL with 7-day refresh"],
  "problems_solved": ["fixed clock skew causing token rejections — added 30s leeway"],
  "patterns_observed": ["always write integration tests alongside auth changes"]
}
```

## Memory Hygiene

- Do not write duplicate L1 facts. If a fact is already in L1 recall output, do not
  pin it again.
- Do not write episodes for trivial sessions.
- If an L3 card is obviously wrong, tell the user and suggest running `apam forget
  <card-id>` followed by `apam consolidate` to regenerate.
- Trust L1 `user_confirmed` facts absolutely. Treat `claude_inferred` as strong
  defaults that the user can override.
```

- [ ] **Step 2: Commit**

```bash
git add packages/apam-skill/skill.md
git commit -m "feat: APAM Superpowers skill — cognitive policy for Claude Code"
```

---

## Task 13: Full Test Run + README

**Files:**
- Modify: `packages/apam-mcp/package.json` (already exists)
- Create: `README.md`

- [ ] **Step 1: Run the full test suite**

```bash
cd packages/apam-mcp && npm test
```

Expected: All tests passing. Output similar to:
```
✓ tests/db/schema.test.ts (3)
✓ tests/layers/l1.test.ts (4)
✓ tests/layers/l2.test.ts (3)
✓ tests/layers/l3.test.ts (4)
✓ tests/consolidation/job.test.ts (6)
✓ tests/tools/recall.test.ts (4)
✓ tests/tools/pin.test.ts (2)
✓ tests/tools/write-episode.test.ts (1)
✓ tests/utils/project-id.test.ts (3)
Test Files  9 passed
Tests      30 passed
```

- [ ] **Step 2: Do a full build**

```bash
cd packages/apam-mcp && npm run build
```

Expected: `dist/` contains `server.js`, `cli.js`, `hooks/load-context.js`, `hooks/write-episode.js` with no errors.

- [ ] **Step 3: Smoke test the CLI**

```bash
cd packages/apam-mcp && node dist/cli.js
```

Expected: Usage help printed with init/status/consolidate/forget commands listed.

- [ ] **Step 4: Write `README.md`**

```markdown
# APAM MCP — Anthropomorphic Procedural Agent Memory for Claude Code

Gives Claude Code persistent, layered memory across sessions.
No more blank-slate starts. Claude remembers your preferences,
past decisions, and what was worked on — automatically.

## How It Works

- **L1 Fast Recall**: pinned preferences, decisions, constraints
- **L2 Episodes**: automatic session logs with git context
- **L3 Semantic Cards**: consolidated knowledge distilled from episodes
- **L4**: your codebase (Claude Code reads it directly — no duplication)

## Install

```bash
# 1. Start the MCP server (keep it running)
npx apam-mcp

# 2. Add to ~/.claude/claude_desktop_config.json
{
  "mcpServers": {
    "apam": {
      "command": "npx",
      "args": ["apam-mcp"]
    }
  }
}

# 3. Install the APAM skill plugin
# Copy packages/apam-skill/skill.md to your Superpowers skills directory

# 4. Initialise for your project (from the project directory)
npx apam init
```

## CLI

```bash
apam init          # Initialise project + configure Claude Code hooks
apam status        # Memory health snapshot
apam consolidate   # Manually trigger L3 consolidation
apam forget <id>   # Remove an L3 card by ID
```

## Memory Lifecycle

1. **Session start** — `apam_recall` loads L1 + L3 + recent episodes into context
2. **Mid-session** — `apam_pin` saves high-salience facts to L1
3. **Session end** — `apam_write_episode` records what was done
4. **Every 5 episodes** — automatic L3 consolidation distills durable knowledge

## Design

See [docs/superpowers/specs/2026-04-03-apam-claude-code-design.md](docs/superpowers/specs/2026-04-03-apam-claude-code-design.md)
```

- [ ] **Step 5: Final commit**

```bash
git add README.md
git commit -m "feat: README and final smoke test"
```

---

## Self-Review Notes

Checked against spec:
- ✅ L1/L2/L3 data models — all implemented with schemas matching spec exactly
- ✅ Five MCP tools — recall, pin, write_episode, consolidate, status
- ✅ `global` vs `project` scope on L1 — implemented in pinAtom and getAtomsForRecall
- ✅ `consolidated` flag on L2, idempotent consolidation — markConsolidated + unconsolidated query
- ✅ Provenance on L3 — source_episode_ids populated and merged on upsert
- ✅ Graceful degradation on hooks — both hook commands exit(0) always
- ✅ Deduplication on L1 pin — fingerprint check before insert
- ✅ L1 eviction policy — salience < 0.2 AND > 30 days → evicted on recall
- ✅ Consolidation threshold = 5, auto-triggered after write_episode
- ✅ Skill cognitive policy — session start, mid-session, session end protocols
- ✅ CLI init configures hooks in settings.json automatically
- ✅ Open question (consolidation model) — rule-based in v1, documented in spec
- ✅ Open question (session ID) — 10-minute dedup window in hook fallback
- ✅ Open question (project ID) — git remote with directory path fallback
