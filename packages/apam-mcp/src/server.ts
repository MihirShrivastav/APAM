import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getDb } from './db/client.js';
import { handleRecall } from './tools/recall.js';
import { handlePin } from './tools/pin.js';
import { handleWriteEpisode } from './tools/write-episode.js';
import { handleConsolidate } from './tools/consolidate.js';
import { handleStatus } from './tools/status.js';
import { upsertCard } from './layers/l3.js';
import { getProjectId } from './utils/project-id.js';

const server = new McpServer({
  name: 'apam-mcp',
  version: '0.1.0',
});

server.tool(
  'apam_recall',
  'Load full project memory: L1 fast recall (preferences, project index), Project Intelligence (architecture, patterns, plans), and recent session episodes. Call at the start of every session before doing anything else.',
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
  'Record a session episode into L2. Call when a meaningful chunk of work is complete — can be called multiple times per session. Include implementation plan summaries and doc pointers where relevant. Automatically triggers Project Intelligence consolidation when threshold is reached.',
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
  'apam_update_intelligence',
  'Directly write or update a Project Intelligence record. Use immediately when architectural decisions are made, key patterns emerge, important module knowledge is established, or future plans are discussed. Do NOT wait for episode consolidation — write as soon as the knowledge is produced.',
  {
    project_id: z.string(),
    type: z.enum(['architecture', 'procedural', 'pattern', 'entity']).describe(
      'architecture = system design, key decisions, tech stack; procedural = how-to knowledge, workflows; pattern = recurring approaches, conventions; entity = key modules, APIs, data models'
    ),
    title: z.string().describe('Short unique label (e.g. "Auth System", "API Endpoints", "Folder Structure", "Future Plans")'),
    content: z.string().describe('The knowledge — clear, structured, useful to a future session starting cold'),
    source_episode_ids: z.array(z.string()).optional(),
  },
  async ({ project_id, type, title, content, source_episode_ids }) => {
    const db = getDb(project_id);
    const card = upsertCard(db, { type, project_id, title, content, source_episode_ids: source_episode_ids ?? [] });
    return { content: [{ type: 'text', text: `Project Intelligence updated: "${title}" (${type}, v${card.version})` }] };
  }
);

server.tool(
  'apam_consolidate',
  'Trigger consolidation — distills unconsolidated L2 episodes into Project Intelligence records.',
  { project_id: z.string() },
  async ({ project_id }) => {
    const db = getDb(project_id);
    const content = handleConsolidate(db, project_id);
    return { content: [{ type: 'text', text: content }] };
  }
);

server.tool(
  'apam_status',
  'Show memory health snapshot for the current project. Call with no arguments — auto-detects the project from cwd. Returns the project_id you must copy exactly for all other tool calls.',
  { project_id: z.string().optional().describe('Omit to auto-detect from current directory') },
  async ({ project_id }) => {
    const resolvedId = project_id ?? getProjectId();
    const db = getDb(resolvedId);
    const content = handleStatus(db, resolvedId);
    return { content: [{ type: 'text', text: content }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
