import type Database from 'better-sqlite3';
import { writeEpisode, countUnconsolidated } from '../layers/l2.js';
import { runConsolidation, CONSOLIDATION_THRESHOLD } from '../consolidation/job.js';
import type { L2Episode } from '../layers/l2.js';

type EpisodeInput = Omit<L2Episode, 'id' | 'consolidated' | 'project_id' | 'agent_name'> & {
  agent_name?: string;
};

export function handleWriteEpisode(
  db: Database.Database,
  projectId: string,
  input: EpisodeInput
): string {
  writeEpisode(db, { ...input, project_id: projectId, agent_name: input.agent_name ?? 'unknown' });

  const unconsolidated = countUnconsolidated(db, projectId);
  let consolidationMsg = '';

  if (unconsolidated >= CONSOLIDATION_THRESHOLD) {
    const result = runConsolidation(db, projectId);
    consolidationMsg = ` Auto-consolidated ${result.episodesProcessed} episodes into ${result.cardsCreated} new L3 cards.`;
  }

  return `Episode recorded for project ${projectId} (${unconsolidated} unconsolidated episodes remain).${consolidationMsg}`;
}
