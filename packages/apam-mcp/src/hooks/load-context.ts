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
