import type Database from 'better-sqlite3';
import { getUnconsolidatedEpisodes, countUnconsolidated, markConsolidated } from '../layers/l2.js';
import { upsertCard } from '../layers/l3.js';
import type { L3Type } from '../layers/l3.js';

function getExistingCardContent(
  db: Database.Database,
  projectId: string,
  type: L3Type,
  title: string
): string | null {
  const row = db
    .prepare('SELECT content FROM l3_cards WHERE project_id = ? AND type = ? AND title = ?')
    .get(projectId, type, title) as { content: string } | undefined;
  return row ? row.content : null;
}

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
    const existingDecisionContent = getExistingCardContent(db, projectId, 'architecture', 'Key Decisions');
    const newLines = allDecisions.map(d => `- ${d}`).join('\n');
    const mergedContent = existingDecisionContent
      ? `${existingDecisionContent}\n${newLines}`
      : newLines;
    upsertCard(db, {
      type: 'architecture',
      project_id: projectId,
      title: 'Key Decisions',
      content: mergedContent,
      source_episode_ids: episodeIds,
    });
  }

  // Patterns → pattern card
  const allPatterns = episodes.flatMap(e => e.patterns_observed).filter(Boolean);
  if (allPatterns.length > 0) {
    const existingPatternContent = getExistingCardContent(db, projectId, 'pattern', 'Observed Patterns');
    const newLines = allPatterns.map(p => `- ${p}`).join('\n');
    const mergedContent = existingPatternContent
      ? `${existingPatternContent}\n${newLines}`
      : newLines;
    upsertCard(db, {
      type: 'pattern',
      project_id: projectId,
      title: 'Observed Patterns',
      content: mergedContent,
      source_episode_ids: episodeIds,
    });
  }

  // Problems solved → procedural card
  const allProblems = episodes.flatMap(e => e.problems_solved).filter(Boolean);
  if (allProblems.length > 0) {
    const existingProblemContent = getExistingCardContent(db, projectId, 'procedural', 'Problems Solved');
    const newLines = allProblems.map(p => `- ${p}`).join('\n');
    const mergedContent = existingProblemContent
      ? `${existingProblemContent}\n${newLines}`
      : newLines;
    upsertCard(db, {
      type: 'procedural',
      project_id: projectId,
      title: 'Problems Solved',
      content: mergedContent,
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
