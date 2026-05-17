import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config — kept small on purpose.
 *
 *   - `node` environment because everything in `src/lib` is pure logic
 *     (helpers, parsers, scoring). Component tests, if we add them later,
 *     can override the environment with a `// @vitest-environment jsdom`
 *     pragma at the top of the file.
 *   - `@/...` alias mirrors the tsconfig path so imports look identical
 *     to the app code.
 *   - Globals on, so tests can use `describe/it/expect` without imports.
 *   - Coverage is opt-in via `npm run test:coverage` — running it by
 *     default would slow `npm test` for very little gain at this scale.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      exclude: ['**/*.test.*', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
