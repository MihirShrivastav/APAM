import { getProjectId } from '../utils/project-id.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { buildSessionStartOutput } from './load-context-output.js';

try {
  const projectId = getProjectId();
  const dbPath = join(homedir(), '.apam', projectId, 'apam.db');

  if (existsSync(dbPath)) {
    process.stdout.write(`${buildSessionStartOutput(projectId)}\n`);
  }
} catch {
  // Never block a session.
}

// Always exit 0 - never block a session.
process.exit(0);
