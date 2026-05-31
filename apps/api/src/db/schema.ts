import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const datasources = sqliteTable('datasources', {
  id: text('id').primaryKey(),
  orgId: text('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  type: text('type').notNull(),
  url: text('url').notNull(),
  authType: text('auth_type').notNull().default('none'),
  credentials: text('credentials'),
  queryTimeoutMs: integer('query_timeout_ms').notNull().default(30000),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const folders = sqliteTable(
  'folders',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    parentId: text('parent_id').references((): ReturnType<typeof text> => folders.id),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  table => [uniqueIndex('folders_org_parent_slug_idx').on(table.orgId, table.parentId, table.slug)],
);

export const dashboards = sqliteTable(
  'dashboards',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    folderId: text('folder_id').references(() => folders.id),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    tags: text('tags', { mode: 'json' }).notNull().$type<string[]>().default([]),
    panels: text('panels', { mode: 'json' }).notNull().$type<unknown[]>().default([]),
    variables: text('variables', { mode: 'json' }).notNull().$type<unknown[]>().default([]),
    timeRange: text('time_range', { mode: 'json' })
      .notNull()
      .$type<{ from: string; to: string; refresh: string | null }>()
      .default({ from: 'now-1h', to: 'now', refresh: null }),
    version: integer('version').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  table => [uniqueIndex('dashboards_org_slug_idx').on(table.orgId, table.slug)],
);

export const dashboardVersions = sqliteTable(
  'dashboard_versions',
  {
    id: text('id').primaryKey(),
    dashboardId: text('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    data: text('data').notNull(),
    message: text('message').notNull().default(''),
    createdBy: text('created_by').notNull().default(''),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  table => [uniqueIndex('dashboard_versions_dashboard_version_idx').on(table.dashboardId, table.version)],
);
