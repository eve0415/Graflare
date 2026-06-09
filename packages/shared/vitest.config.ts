import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // vitest 4's default exclude is only node_modules + .git, so gitignored build-output
    // dirs (which can hold stale compiled *.test.js from a prior build) must be excluded
    // explicitly — otherwise vitest discovers and double-counts them.
    exclude: [...configDefaults.exclude, '**/dist/**', '**/.output/**', '**/.vinxi/**', '**/.wrangler/**'],
  },
});
