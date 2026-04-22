import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { configureCodexIntegration, getCodexIntegrationPaths } from '../../src/integrations/codex.js';

describe('Codex integration', () => {
  it('writes global config, marketplace, and plugin files idempotently', () => {
    const homeRoot = mkdtempSync(join(tmpdir(), 'apam-codex-home-'));

    configureCodexIntegration(homeRoot);
    configureCodexIntegration(homeRoot);

    const { configPath, marketplacePath, pluginRoot } = getCodexIntegrationPaths(homeRoot);
    const pluginPath = join(pluginRoot, '.codex-plugin', 'plugin.json');
    const skillPath = join(pluginRoot, 'skills', 'apam-fetch', 'SKILL.md');

    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(marketplacePath)).toBe(true);
    expect(existsSync(pluginPath)).toBe(true);
    expect(existsSync(skillPath)).toBe(true);

    const config = readFileSync(configPath, 'utf8');
    expect(config).toContain('[mcp_servers.apam]');
    expect(config).toContain('command = "apam-mcp"');
    expect(config).toContain('[hooks.SessionStart]');
    expect(config).toContain('[hooks.Stop]');
    expect((config.match(/# BEGIN APAM/g) ?? []).length).toBe(1);

    const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf8')) as {
      plugins: Array<{ source: { path: string } }>;
    };
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0].source.path).toBe('./plugins/apam');

    const plugin = JSON.parse(readFileSync(pluginPath, 'utf8')) as { name: string; skills: string };
    expect(plugin.name).toBe('apam');
    expect(plugin.skills).toBe('./skills/');
  });
});
