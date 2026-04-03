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
