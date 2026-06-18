import { drizzle } from 'drizzle-orm/d1';

import * as schema from './schema';

const build = (d1: D1Database) => drizzle(d1, { schema });

// drizzle() walks the whole relational schema config on every call. The D1 binding object is
// stable for an isolate's lifetime, so memoize per binding — every caller (the RPC entrypoint,
// each HTTP route handler, the DO, the workflow) shares one Drizzle instance instead of rebuilding
// it per request.
const dbByBinding = new WeakMap<D1Database, ReturnType<typeof build>>();

export const createDb = (d1: D1Database): ReturnType<typeof build> => {
  const cached = dbByBinding.get(d1);
  if (cached !== undefined) return cached;
  const db = build(d1);
  dbByBinding.set(d1, db);
  return db;
};

export type Database = ReturnType<typeof createDb>;
export { schema };
