import type Database from 'better-sqlite3';
import { runConsolidation } from '../consolidation/job.js';

export function handleConsolidate(db: Database.Database, projectId: string): string {
  const result = runConsolidation(db, projectId);
  if (result.episodesProcessed === 0) {
    return 'Nothing to consolidate — no unconsolidated episodes found.';
  }
  return `Consolidated ${result.episodesProcessed} episodes. Created ${result.cardsCreated} new L3 cards, updated ${result.cardsUpdated} existing cards.`;
}
