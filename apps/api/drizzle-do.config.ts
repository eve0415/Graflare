import { defineConfig } from 'drizzle-kit';

// AlertRuleDO internal SQLite storage. Separate from drizzle.config.ts (the D1
// schema) — different dialect driver and output dir so the two never collide.
export default defineConfig({
  schema: './src/alerting/do-schema.ts',
  out: './drizzle-do',
  dialect: 'sqlite',
  driver: 'durable-sqlite',
});
