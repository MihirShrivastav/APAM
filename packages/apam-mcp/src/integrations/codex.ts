import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

const managedStart = '# BEGIN APAM';
const managedEnd = '# END APAM';

const pluginManifest = `{
  "name": "apam",
  "version": "0.1.0",
  "description": "APAM Memory plugin for Codex.",
  "author": {
    "name": "APAM",
    "url": "https://github.com/MihirShrivastav/APAM"
  },
  "repository": "https://github.com/MihirShrivastav/APAM",
  "license": "MIT",
  "keywords": ["memory", "mcp", "codex"],
  "skills": "./skills/",
  "interface": {
    "displayName": "APAM",
    "shortDescription": "Persistent layered memory for coding agents",
    "longDescription": "Use APAM skills to fetch, initialize, update, and consolidate project memory through the shared APAM MCP server.",
    "developerName": "APAM",
    "category": "Productivity",
    "capabilities": ["Read", "Write"],
    "websiteURL": "https://github.com/MihirShrivastav/APAM",
    "defaultPrompt": [
      "Use APAM to fetch memory for this repository.",
      "Use APAM to update project memory after this task."
    ]
  }
}
`;

const codexSkills: Record<string, string> = {
  'apam/SKILL.md': `---
name: apam
description: APAM Memory for Codex. Use when Codex needs persistent project memory across sessions, or when the user explicitly asks to fetch, initialize, update, or consolidate APAM memory. Explicitly invoke with $apam or $apam-* skills. Do not use for unrelated tasks.
---

# APAM Memory

Use APAM as the project memory system for Codex. Prefer the focused skills for day-to-day work:

- \`$apam-fetch\` at session start
- \`$apam-init\` for a new project
- \`$apam-update\` after meaningful work
- \`$apam-consolidate\` to distill episodes into L3

Always call \`apam_status\` with no arguments first, copy the exact \`Project:\` value, then use that \`project_id\` for APAM tool calls.

When writing inferred facts, use \`confidence = "agent_inferred"\`. When writing Codex-originated memory, pass \`agent_name = "codex"\`.

Use \`/plugins\` to verify APAM is installed and \`/skills\` or \`$apam-*\` to invoke the focused APAM workflows explicitly when needed.
`,
  'apam-fetch/SKILL.md': `---
name: apam-fetch
description: Fetch APAM memory for the current project in Codex. Use at the start of a session or when the user asks to load APAM context.
---

# APAM Fetch

1. Call \`apam_status\` with no arguments.
2. Copy the exact 16-character hex value from the \`Project:\` line.
3. Call \`apam_recall\` with that \`project_id\`.
4. Summarize what APAM knows: key L1 facts, recent L2 episodes, and relevant L3 cards.
5. If no memory exists, say this is a new project and recommend \`$apam-init\`.
`,
  'apam-init/SKILL.md': `---
name: apam-init
description: Initialize APAM memory for a new project in Codex by exploring the codebase and writing initial L1 and L3 memory. Use when APAM has little or no memory for the project.
---

# APAM Init

1. Call \`apam_status\` with no arguments, copy the exact \`project_id\`, then call \`apam_recall\`.
2. Explore the project strategically: README, package manifests, top-level structure, and key source files.
3. Write one L1 atom per fact with \`scope = "project"\`, \`confidence = "agent_inferred"\`, and \`agent_name = "codex"\`.
4. Write at least these L3 cards with \`agent_name = "codex"\`:
   - \`System Overview\`
   - \`Key Modules\`
5. Report what was written and invite corrections.
`,
  'apam-update/SKILL.md': `---
name: apam-update
description: Update APAM memory for work completed in the current Codex session. Use after meaningful implementation, debugging, planning, or design work.
---

# APAM Update

1. Call \`apam_status\` with no arguments unless you already have the exact \`project_id\`.
2. Review what happened in this session: changes made, decisions, files touched, problems solved, patterns observed, and plans discussed.
3. Update or add L1 atoms using \`confidence = "agent_inferred"\` and \`agent_name = "codex"\`.
4. Update L3 cards immediately with \`agent_name = "codex"\`.
5. Write an L2 episode with \`agent_name = "codex"\`.
6. Report what APAM stored.
`,
  'apam-consolidate/SKILL.md': `---
name: apam-consolidate
description: Consolidate APAM episodes into L3 project intelligence in Codex. Use when the project has unconsolidated APAM episodes or the user asks to distill memory.
---

# APAM Consolidate

1. Call \`apam_status\` with no arguments and copy the exact \`project_id\`.
2. Note the unconsolidated episode count from the status output.
3. Call \`apam_consolidate\` with that \`project_id\`.
4. Report how many cards were created or updated.
`,
};

interface CodexIntegrationPaths {
  configPath: string;
  marketplacePath: string;
  pluginRoot: string;
}

interface MarketplaceFile {
  name: string;
  interface?: {
    displayName?: string;
  };
  plugins: Array<{
    name: string;
    source: {
      source: string;
      path: string;
    };
    policy: {
      installation: string;
      authentication: string;
    };
    category: string;
  }>;
}

function replaceManagedBlock(existingContent: string, managedBlock: string): string {
  const normalized = existingContent.trim();
  const block = `${managedStart}\n${managedBlock.trim()}\n${managedEnd}`;

  if (!normalized) return `${block}\n`;

  const pattern = new RegExp(`${managedStart}[\\s\\S]*?${managedEnd}`, 'm');
  if (pattern.test(existingContent)) {
    return existingContent.replace(pattern, block);
  }

  return `${existingContent.trimEnd()}\n\n${block}\n`;
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function getCodexIntegrationPaths(homePath = homedir()): CodexIntegrationPaths {
  return {
    configPath: join(homePath, '.codex', 'config.toml'),
    marketplacePath: join(homePath, '.agents', 'plugins', 'marketplace.json'),
    pluginRoot: join(homePath, 'plugins', 'apam'),
  };
}

export function buildCodexConfig(): string {
  return `
[mcp_servers.apam]
command = "apam-mcp"

[hooks]

[hooks.SessionStart]
matcher = "startup|resume"
hooks = [
  { type = "command", command = "apam-load-context", statusMessage = "Checking APAM memory" }
]

[hooks.Stop]
hooks = [
  { type = "command", command = "apam-write-episode --agent codex", timeout = 30 }
]
`;
}

function upsertMarketplaceEntry(marketplacePath: string): void {
  ensureDir(dirname(marketplacePath));

  const existing = readJsonFile<MarketplaceFile>(marketplacePath);
  const marketplace: MarketplaceFile = existing ?? {
    name: 'apam-local',
    interface: { displayName: 'APAM Local Plugins' },
    plugins: [],
  };

  if (!marketplace.interface) {
    marketplace.interface = { displayName: 'APAM Local Plugins' };
  }

  const entry = {
    name: 'apam',
    source: {
      source: 'local',
      path: './plugins/apam',
    },
    policy: {
      installation: 'AVAILABLE',
      authentication: 'ON_INSTALL',
    },
    category: 'Productivity',
  };

  const existingIndex = marketplace.plugins.findIndex(plugin => plugin.name === 'apam');
  if (existingIndex >= 0) {
    marketplace.plugins[existingIndex] = entry;
  } else {
    marketplace.plugins.push(entry);
  }

  writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2));
}

function writePluginFiles(pluginRoot: string): string[] {
  const createdPaths: string[] = [];
  const pluginMetaDir = join(pluginRoot, '.codex-plugin');
  ensureDir(pluginMetaDir);

  const pluginManifestPath = join(pluginMetaDir, 'plugin.json');
  writeFileSync(pluginManifestPath, pluginManifest);
  createdPaths.push(pluginManifestPath);

  for (const [relativePath, contents] of Object.entries(codexSkills)) {
    const skillPath = join(pluginRoot, 'skills', ...relativePath.split('/'));
    ensureDir(dirname(skillPath));
    writeFileSync(skillPath, contents);
    createdPaths.push(skillPath);
  }

  return createdPaths;
}

export function configureCodexIntegration(homePath = homedir()): string[] {
  const createdPaths: string[] = [];
  const { configPath, marketplacePath, pluginRoot } = getCodexIntegrationPaths(homePath);

  ensureDir(dirname(configPath));
  const existingConfig = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
  writeFileSync(configPath, replaceManagedBlock(existingConfig, buildCodexConfig()));
  createdPaths.push(configPath);

  upsertMarketplaceEntry(marketplacePath);
  createdPaths.push(marketplacePath);

  createdPaths.push(...writePluginFiles(pluginRoot));

  return createdPaths;
}

export function isCodexIntegrationConfigured(homePath = homedir()): boolean {
  const { configPath, marketplacePath, pluginRoot } = getCodexIntegrationPaths(homePath);
  const pluginManifestPath = join(pluginRoot, '.codex-plugin', 'plugin.json');

  if (!existsSync(configPath) || !existsSync(marketplacePath) || !existsSync(pluginManifestPath)) {
    return false;
  }

  const config = readFileSync(configPath, 'utf8');
  const marketplace = readJsonFile<MarketplaceFile>(marketplacePath);

  const hasManagedConfig =
    config.includes('[mcp_servers.apam]') &&
    config.includes('apam-mcp') &&
    config.includes('apam-load-context') &&
    config.includes('apam-write-episode --agent codex');

  const hasMarketplaceEntry =
    marketplace?.plugins?.some(
      plugin => plugin.name === 'apam' && plugin.source.path === './plugins/apam'
    ) ?? false;

  return hasManagedConfig && hasMarketplaceEntry;
}
