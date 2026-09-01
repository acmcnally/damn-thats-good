import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  // Workspace packages are consumed as source (ADR-0005); bundle them into the output.
  noExternal: [/^@dtg\//],
});
