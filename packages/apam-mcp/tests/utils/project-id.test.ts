import { describe, it, expect } from 'vitest';
import { getProjectId } from '../../src/utils/project-id.js';

describe('getProjectId', () => {
  it('returns a 16-char hex string', () => {
    const id = getProjectId(process.cwd());
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns the same id for the same directory', () => {
    expect(getProjectId(process.cwd())).toBe(getProjectId(process.cwd()));
  });

  it('returns different ids for different directories', () => {
    expect(getProjectId('/tmp/project-a')).not.toBe(getProjectId('/tmp/project-b'));
  });
});
