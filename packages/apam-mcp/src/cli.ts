import { getDb } from './db/client.js';
import { getProjectId, getProjectLabel } from './utils/project-id.js';
import { handleConsolidate } from './tools/consolidate.js';
import { handleStatus } from './tools/status.js';
import { deleteCard } from './layers/l3.js';
import { configureClaudeIntegration, isClaudeIntegrationConfigured } from './integrations/claude.js';
import { configureCodexIntegration, isCodexIntegrationConfigured } from './integrations/codex.js';

const [, , command, ...args] = process.argv;

switch (command) {
  case 'init': {
    const projectId = getProjectId();
    const label = getProjectLabel();
    console.log(`Initialising APAM for project: ${label} (${projectId})`);

    // Ensure DB is created
    getDb(projectId);

    console.log('APAM database is ready.');
    console.log('Integration status:');
    console.log(
      isClaudeIntegrationConfigured()
        ? '  Claude Code: already installed globally; you can use APAM in this repo now'
        : '  Claude Code: install once globally with apam integrate claude'
    );
    console.log(
      isCodexIntegrationConfigured()
        ? '  Codex:       already installed globally; you can use APAM in this repo now'
        : '  Codex:       install once globally with apam integrate codex'
    );
    break;
  }

  case 'integrate': {
    const target = args[0];

    if (target === 'claude') {
      const settingsPath = configureClaudeIntegration();
      console.log(`Claude integration configured in ${settingsPath}`);
      break;
    }

    if (target === 'codex') {
      const paths = configureCodexIntegration();
      console.log('Codex integration configured:');
      for (const path of paths) console.log(`  ${path}`);
      break;
    }

    if (target === 'all') {
      const settingsPath = configureClaudeIntegration();
      const paths = configureCodexIntegration();
      console.log(`Claude integration configured in ${settingsPath}`);
      console.log('Codex integration configured:');
      for (const path of paths) console.log(`  ${path}`);
      break;
    }

    console.error('Usage: apam integrate <claude|codex|all>');
    process.exit(1);
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
  apam init          Initialise APAM for this project
  apam integrate     Configure Claude, Codex, or both for this project
  apam status        Show memory health snapshot
  apam consolidate   Manually trigger L3 consolidation
  apam forget <id>   Delete an L3 card by ID
`);
}
