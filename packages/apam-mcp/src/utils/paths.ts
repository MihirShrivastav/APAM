import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { execSync } from 'child_process';

export function getPackageRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return resolve(dirname(currentFile), '..', '..');
}

export function getRepoRoot(cwd = process.cwd()): string {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return cwd;
  }
}

export function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/');
}
