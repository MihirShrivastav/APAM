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

  const episodeIds = episodes.map(episode => episode.id);
  let cardsCreated = 0;
  let cardsUpdated = 0;

  function upsertWithTracking(type: L3Type, title: string, content: string): void {
    const existing = getExistingCardContent(db, projectId, type, title);
    const mergedContent = existing ? `${existing}\n${content}` : content;
    const sourceAgent = episodes[episodes.length - 1]?.agent_name ?? 'unknown';

    upsertCard(db, {
      type,
      project_id: projectId,
      title,
      content: mergedContent,
      source_episode_ids: episodeIds,
      created_by_agent: sourceAgent,
      updated_by_agent: sourceAgent,
    });

    if (existing) cardsUpdated++;
    else cardsCreated++;
  }

  const allDecisions = episodes.flatMap(episode => episode.decisions).filter(Boolean);
  if (allDecisions.length > 0) {
    upsertWithTracking('architecture', 'Key Decisions', allDecisions.map(decision => `- ${decision}`).join('\n'));
  }

  const allPatterns = episodes.flatMap(episode => episode.patterns_observed).filter(Boolean);
  if (allPatterns.length > 0) {
    upsertWithTracking('pattern', 'Observed Patterns', allPatterns.map(pattern => `- ${pattern}`).join('\n'));
  }

  const allProblems = episodes.flatMap(episode => episode.problems_solved).filter(Boolean);
  if (allProblems.length > 0) {
    upsertWithTracking('procedural', 'Problems Solved', allProblems.map(problem => `- ${problem}`).join('\n'));
  }

  const dirCount: Record<string, number> = {};
  for (const episode of episodes) {
    for (const file of episode.files_touched) {
      const topDir = file.split('/')[0] || file;
      dirCount[topDir] = (dirCount[topDir] ?? 0) + 1;
    }
  }

  const topDirs = Object.entries(dirCount)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .filter(([, count]) => count >= 2);

  for (const [dir] of topDirs) {
    const relevantEpisodes = episodes.filter(episode =>
      episode.files_touched.some(file => file.startsWith(dir))
    );
    const summaries = relevantEpisodes.map(episode => episode.summary).filter(Boolean);
    if (summaries.length === 0) continue;

    const title = `Module: ${dir}`;
    const content = `Frequently modified. Recent activity:\n${summaries.slice(-3).map(summary => `- ${summary}`).join('\n')}`;
    const existing = getExistingCardContent(db, projectId, 'entity', title);
    const sourceAgent = relevantEpisodes[relevantEpisodes.length - 1]?.agent_name ?? 'unknown';

    upsertCard(db, {
      type: 'entity',
      project_id: projectId,
      title,
      content,
      source_episode_ids: relevantEpisodes.map(episode => episode.id),
      created_by_agent: sourceAgent,
      updated_by_agent: sourceAgent,
    });

    if (existing) cardsUpdated++;
    else cardsCreated++;
  }

  markConsolidated(db, episodeIds);

  return {
    episodesProcessed: episodes.length,
    cardsCreated,
    cardsUpdated,
  };
}
