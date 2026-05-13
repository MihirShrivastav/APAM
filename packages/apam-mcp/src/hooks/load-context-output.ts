export function buildSessionStartOutput(projectId: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `APAM memory is available for project ${projectId}. If this is the start of a session, call apam_recall with project_id="${projectId}" to load memory context.`,
    },
  });
}
