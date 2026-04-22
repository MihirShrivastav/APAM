import { getProjectId } from '../utils/project-id.js';
import { getGitContext } from '../utils/git.js';
import { getDb } from '../db/client.js';
import { getRecentEpisodes, writeEpisode } from '../layers/l2.js';

const agentArgIndex = process.argv.indexOf('--agent');
const agentName =
  agentArgIndex >= 0 && process.argv[agentArgIndex + 1]
    ? process.argv[agentArgIndex + 1]
    : 'unknown';

try {
  const projectId = getProjectId();
  const db = getDb(projectId);
  const now = new Date();

  // Skip if an agent already wrote an episode in the last 10 minutes
  const recent = getRecentEpisodes(db, projectId, 1);
  if (recent.length > 0) {
    const lastEnd = new Date(recent[0].session_end);
    const minutesSince = (now.getTime() - lastEnd.getTime()) / 60000;
    if (minutesSince < 10) {
      process.exit(0);
    }
  }

  const git = getGitContext();
  writeEpisode(db, {
    project_id: projectId,
    session_start: now.toISOString(),
    session_end: now.toISOString(),
    git_branch: git.branch,
    git_commit_before: git.commitBefore,
    git_commit_after: git.commitAfter,
    files_touched: git.filesTouched,
    summary: '',
    decisions: [],
    problems_solved: [],
    patterns_observed: [],
    agent_name: agentName,
  });
} catch {
  // Never block a session
}

process.exit(0);
