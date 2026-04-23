import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { configureClaudeIntegration } from '../../src/integrations/claude.js';

describe('Claude integration', () => {
  it('writes hooks idempotently into settings.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'apam-claude-'));
    const settingsPath = join(root, 'settings.json');

    configureClaudeIntegration(settingsPath);
    configureClaudeIntegration(settingsPath);

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks: {
        PreToolUse: Array<{ hooks: Array<{ command: string }> }>;
        Stop: Array<{ hooks: Array<{ command: string }> }>;
      };
    };

    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.Stop).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe('apam-load-context');
    expect(settings.hooks.Stop[0].hooks[0].command).toContain('apam-write-episode --agent claude-code');
  });
});
