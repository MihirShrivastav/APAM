import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getDb } from './db/client.js';
import { handleRecall } from './tools/recall.js';
import { handlePin } from './tools/pin.js';
import { handleWriteEpisode } from './tools/write-episode.js';
import { handleConsolidate } from './tools/consolidate.js';
import { handleStatus } from './tools/status.js';

const server = new McpServer({
  name: 'apam-mcp',
  version: '0.1.0',
});

server.tool(
  'apam_recall',
  'Load project memory context (L1 fast recall + L3 semantic cards + recent sessions). Call this at the start of every session.',
  { project_id: z.string().describe('Project identifier derived from git remote or directory hash') },
  async ({ project_id }) => {
    const db = getDb(project_id);
    const content = handleRecall(db, project_id);
    return { content: [{ type: 'text', text: content }] };
  }
);

server.tool(
  'apam_pin',
  'Store a high-salience fact into L1 fast recall. Use for user preferences, architectural decisions, constraints, and commitments.',
  {
    type: z.enum(['preference', 'decision', 'constraint', 'commitment']),
    content: z.string().describe('Concise single-fact plain text'),
    scope: z.enum(['global', 'project']).describe('global = all projects, project = this repo only'),
    confidence: z.enum(['user_confirmed', 'claude_inferred']),
    project_id: z.string().optional().describe('Required when scope is project'),
    source_episode_id: z.string().optional(),
    salience: z.number().min(0).max(1).optional().describe('0.0–1.0, defaults to 0.9 for user_confirmed, 0.7 for claude_inferred'),
  },
  async (input) => {
    const projectId = input.project_id ?? 'global';
    const db = getDb(projectId);
    const content = handlePin(db, {
      type: input.type,
      content: input.content,
      scope: input.scope,
      confidence: input.confidence,
      project_id: input.project_id,
      source_episode_id: input.source_episode_id,
      salience: input.salience,
    });
    return { content: [{ type: 'text', text: content }] };
  }
);

server.tool(
  'apam_write_episode',
  'Record a session episode into L2 memory. Call before finishing the final response of a session. Automatically triggers L3 consolidation when threshold is reached.',
  {
    project_id: z.string(),
    session_start: z.string().describe('ISO 8601 timestamp'),
    session_end: z.string().describe('ISO 8601 timestamp'),
    git_branch: z.string().default(''),
    git_commit_before: z.string().default(''),
    git_commit_after: z.string().default(''),
    files_touched: z.array(z.string()).default([]),
    summary: z.string().describe('2–4 sentence description of what was accomplished'),
    decisions: z.array(z.string()).default([]).describe('Key architectural or technical choices made'),
    problems_solved: z.array(z.string()).default([]).describe('Bugs fixed or blockers cleared'),
    patterns_observed: z.array(z.string()).default([]).describe('Recurring approaches or style signals'),
  },
  async (input) => {
    const { project_id, ...episodeInput } = input;
    const db = getDb(project_id);
    const content = handleWriteEpisode(db, project_id, episodeInput);
    return { content: [{ type: 'text', text: content }] };
  }
);

server.tool(
  'apam_consolidate',
  'Manually trigger L3 consolidation — distills unconsolidated L2 episodes into semantic knowledge cards.',
  { project_id: z.string() },
  async ({ project_id }) => {
    const db = getDb(project_id);
    const content = handleConsolidate(db, project_id);
    return { content: [{ type: 'text', text: content }] };
  }
);

server.tool(
  'apam_status',
  'Show memory health snapshot: atom counts, unconsolidated episodes, last consolidation timestamp.',
  { project_id: z.string().optional() },
  async ({ project_id }) => {
    const db = getDb(project_id ?? 'global');
    const content = handleStatus(db, project_id);
    return { content: [{ type: 'text', text: content }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
