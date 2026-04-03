import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { resolve } from 'path';

export function getProjectId(cwd = process.cwd()): string {
  try {
    const remote = execSync('git remote get-url origin', {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const normalized = remote
      .replace(/^(https?:\/\/|git@|ssh:\/\/)/, '')
      .replace(/\.git$/, '')
      .replace(/\/$/, '');
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  } catch {
    return createHash('sha256').update(resolve(cwd)).digest('hex').slice(0, 16);
  }
}

export function getProjectLabel(cwd = process.cwd()): string {
  try {
    const remote = execSync('git remote get-url origin', {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return remote.split('/').pop()?.replace(/\.git$/, '') ?? cwd.split(/[/\\]/).pop() ?? 'unknown';
  } catch {
    return cwd.split(/[/\\]/).pop() ?? 'unknown';
  }
}
