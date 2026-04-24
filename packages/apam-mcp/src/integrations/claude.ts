import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

export function getClaudeSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

export function readClaudeSettings(settingsPath = getClaudeSettingsPath()): Record<string, unknown> {
  if (!existsSync(settingsPath)) return {};
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function configureClaudeIntegration(settingsPath = getClaudeSettingsPath()): string {
  const settings = readClaudeSettings(settingsPath);
  const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};

  const loadContextHook = { type: 'command', command: 'apam-load-context' };
  const writeEpisodeHook = { type: 'command', command: 'apam-write-episode --agent claude-code' };

  const preToolUse = (hooks.PreToolUse as { matcher: string; hooks: unknown[] }[]) ?? [];
  if (!preToolUse.some(hook => JSON.stringify(hook).includes('apam-load-context'))) {
    preToolUse.push({ matcher: '.*', hooks: [loadContextHook] });
  }

  const stopHooks = (hooks.Stop as { hooks: unknown[] }[]) ?? [];
  if (!stopHooks.some(hook => JSON.stringify(hook).includes('apam-write-episode'))) {
    stopHooks.push({ hooks: [writeEpisodeHook] });
  }

  settings.hooks = { ...hooks, PreToolUse: preToolUse, Stop: stopHooks };

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  return settingsPath;
}

export function isClaudeIntegrationConfigured(settingsPath = getClaudeSettingsPath()): boolean {
  const settings = readClaudeSettings(settingsPath);
  const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};
  const preToolUse = (hooks.PreToolUse as unknown[]) ?? [];
  const stopHooks = (hooks.Stop as unknown[]) ?? [];

  const hasLoadContext = preToolUse.some(hook => JSON.stringify(hook).includes('apam-load-context'));
  const hasWriteEpisode = stopHooks.some(hook => JSON.stringify(hook).includes('apam-write-episode'));

  return hasLoadContext && hasWriteEpisode;
}
