import { describe, expect, it } from 'vitest';
import { buildSessionStartOutput } from '../../src/hooks/load-context-output.js';

describe('load-context hook', () => {
  it('emits Codex-compatible SessionStart hook JSON', () => {
    const output = JSON.parse(buildSessionStartOutput('a1045532a0a72afd')) as {
      hookSpecificOutput?: {
        hookEventName?: string;
        additionalContext?: string;
      };
    };

    expect(output.hookSpecificOutput?.hookEventName).toBe('SessionStart');
    expect(output.hookSpecificOutput?.additionalContext).toContain(
      'APAM memory is available for project a1045532a0a72afd.'
    );
    expect(output.hookSpecificOutput?.additionalContext).toContain(
      'call apam_recall with project_id="a1045532a0a72afd"'
    );
  });
});
