import { execSync } from 'child_process';

export interface GitContext {
  branch: string;
  commitBefore: string;
  commitAfter: string;
  filesTouched: string[];
}

export function getCurrentCommit(cwd = process.cwd()): string {
  try {
    return execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

export function getGitContext(
  sessionStartCommit?: string,
  cwd = process.cwd()
): GitContext {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const commitAfter = getCurrentCommit(cwd);
    const commitBefore = sessionStartCommit || commitAfter;

    let filesTouched: string[] = [];
    if (commitBefore && commitAfter && commitBefore !== commitAfter) {
      const diff = execSync(`git diff --name-only ${commitBefore}..${commitAfter}`, {
        encoding: 'utf8',
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      filesTouched = diff.trim().split('\n').filter(Boolean);
    }

    return { branch, commitBefore, commitAfter, filesTouched };
  } catch {
    return { branch: 'unknown', commitBefore: '', commitAfter: '', filesTouched: [] };
  }
}
