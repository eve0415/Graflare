import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
})

export const datasources = sqliteTable("datasources", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  type: text("type").notNull(),
  url: text("url").notNull(),
  authType: text("auth_type").notNull().default("none"),
  credentials: text("credentials"),
  queryTimeoutMs: integer("query_timeout_ms").notNull().default(30000),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
})
