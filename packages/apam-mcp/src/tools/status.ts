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
