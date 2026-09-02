import { dirname } from 'node:path';

import { transformFile } from '@swc/core';
import { defineConfig, type Options } from 'tsup';

type EsbuildPlugin = NonNullable<Options['esbuildPlugins']>[number];

/**
 * esbuild can't emit decorator metadata (it has no type system), which NestJS DI
 * needs. Route every `.ts` file through SWC for the transform (config in .swcrc),
 * then let esbuild bundle the result. `resolveDir` must be set or esbuild can't
 * resolve the file's own imports (`@dtg/*`, etc.).
 */
const swcTransform: EsbuildPlugin = {
  name: 'swc-transform',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      const { code, map } = await transformFile(args.path, { sourceMaps: true });
      const inlineMap = map
        ? `\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(map).toString('base64')}`
        : '';
      return { contents: code + inlineMap, loader: 'js', resolveDir: dirname(args.path) };
    });
  },
};

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  clean: true,
  sourcemap: true,
  // Workspace packages are consumed as source (ADR-0005); bundle them into the output.
  noExternal: [/^@dtg\//],
  esbuildPlugins: [swcTransform],
});
