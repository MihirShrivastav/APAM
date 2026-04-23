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
    const lines = l1Atoms.map(atom => `[${atom.type}] ${atom.content}`).join('\n');
    sections.push(`## Fast Recall (L1)\n${lines}`);
  }

  if (l3Cards.length > 0) {
    const cards = l3Cards
      .map(card => `### ${card.title} (${card.type})\n${card.content}`)
      .join('\n\n');
    sections.push(`## L3 - Project Intelligence\n${cards}`);
  }

  if (recentEpisodes.length > 0) {
    const lines = recentEpisodes
      .map(
        episode =>
          `[${episode.session_end.slice(0, 10)}] agent:${episode.agent_name} branch:${episode.git_branch} - ${episode.summary || 'no summary'}`
      )
      .join('\n');
    sections.push(`## Recent Sessions (L2)\n${lines}`);
  }

  if (sections.length === 0) {
    return 'No memory found for this project. This appears to be a new project.';
  }

  return sections.join('\n\n');
}
