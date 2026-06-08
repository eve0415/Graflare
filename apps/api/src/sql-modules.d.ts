// drizzle-kit's durable-sqlite output (`drizzle-do/migrations.js`) imports the
// generated `.sql` files as default string exports; the bundler inlines them via
// the wrangler `Text` rule. Type those imports so the migrations entrypoint stays
// fully typed under strict mode.
declare module '*.sql' {
  const sql: string;
  export default sql;
}
