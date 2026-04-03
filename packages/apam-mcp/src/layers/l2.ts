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
