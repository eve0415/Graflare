import { defineConfig } from 'oxfmt';

export default defineConfig({
  ignorePatterns: [
    '**/dist',
    '**/.output',
    '**/.vinxi',
    '**/.wrangler',
    '**/drizzle',
    '**/drizzle-do',
    '**/worker-configuration.d.ts',
    '**/routeTree.gen.ts',
    '**/.claude',
    '**/.agents',
  ],
  arrowParens: 'avoid',
  singleQuote: true,
  jsxSingleQuote: true,
  printWidth: 160,
  sortTailwindcss: true,
  sortImports: {
    order: 'asc',
    groups: [['type'], ['builtin'], ['external'], ['subpath', 'internal'], ['parent'], ['sibling'], ['index']],
  },
});
