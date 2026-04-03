import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    cli: 'src/cli.ts',
    'hooks/load-context': 'src/hooks/load-context.ts',
    'hooks/write-episode': 'src/hooks/write-episode.ts',
  },
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
