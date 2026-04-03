import { getDb } from './db/client.js';
import { getProjectId, getProjectLabel } from './utils/project-id.js';
import { handleConsolidate } from './tools/consolidate.js';
import { handleStatus } from './tools/status.js';
import { deleteCard } from './layers/l3.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const [, , command, ...args] = process.argv;

function getClaudeSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

function readSettings(): Record<string, unknown> {
  const path = getClaudeSettingsPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(settings: Record<string, unknown>): void {
  const path = getClaudeSettingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2));
}

switch (command) {
  case 'init': {
    const projectId = getProjectId();
    const label = getProjectLabel();
    console.log(`Initialising APAM for project: ${label} (${projectId})`);

    // Ensure DB is created
    getDb(projectId);

    // Configure hooks in Claude Code settings
    const settings = readSettings();
    const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};

    const loadContextHook = { type: 'command', command: 'apam-load-context' };
    const writeEpisodeHook = { type: 'command', command: 'apam-write-episode' };

    const preToolUse = (hooks['PreToolUse'] as { matcher: string; hooks: unknown[] }[]) ?? [];
    if (!preToolUse.some(h => JSON.stringify(h).includes('apam-load-context'))) {
      preToolUse.push({ matcher: '.*', hooks: [loadContextHook] });
    }

    const stopHooks = (hooks['Stop'] as { hooks: unknown[] }[]) ?? [];
    if (!stopHooks.some(h => JSON.stringify(h).includes('apam-write-episode'))) {
      stopHooks.push({ hooks: [writeEpisodeHook] });
    }

    settings.hooks = { ...hooks, PreToolUse: preToolUse, Stop: stopHooks };
    writeSettings(settings);

    console.log('Hooks configured in ~/.claude/settings.json');
    console.log('APAM initialised. Start the server with: npx apam-mcp');
    break;
  }

  case 'status': {
    const projectId = getProjectId();
    const db = getDb(projectId);
    console.log(handleStatus(db, projectId));
    break;
  }

  case 'consolidate': {
    const projectId = getProjectId();
    const db = getDb(projectId);
    console.log(handleConsolidate(db, projectId));
    break;
  }

  case 'forget': {
    const id = args[0];
    if (!id) {
      console.error('Usage: apam forget <card-id>');
      process.exit(1);
    }
    const projectId = getProjectId();
    const db = getDb(projectId);
    const deleted = deleteCard(db, id);
    console.log(deleted ? `Deleted card ${id}` : `Card ${id} not found`);
    break;
  }

  default:
    console.log(`APAM Memory CLI
Usage:
  apam init          Initialise APAM for this project and configure hooks
  apam status        Show memory health snapshot
  apam consolidate   Manually trigger L3 consolidation
  apam forget <id>   Delete an L3 card by ID
`);
}
