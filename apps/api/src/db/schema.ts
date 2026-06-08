import type { AlertCondition, AlertQuery, ContactPointSettings, LabelMatcher, MuteTimeInterval } from '@graflare/shared/schemas/alerting';
import type { Panel } from '@graflare/shared/schemas/panel';
import type { Variable } from '@graflare/shared/schemas/variable';

import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
  dialect: text('dialect'),
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
    panels: text('panels', { mode: 'json' }).notNull().$type<Panel[]>().default([]),
    variables: text('variables', { mode: 'json' }).notNull().$type<Variable[]>().default([]),
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

export const alertRuleGroups = sqliteTable(
  'alert_rule_groups',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    folderId: text('folder_id').references(() => folders.id),
    name: text('name').notNull(),
    evalIntervalS: integer('eval_interval_s').notNull().default(60),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  table => [uniqueIndex('alert_rule_groups_org_folder_name_idx').on(table.orgId, table.folderId, table.name)],
);

export const alertRules = sqliteTable(
  'alert_rules',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    groupId: text('group_id')
      .notNull()
      .references(() => alertRuleGroups.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    queries: text('queries', { mode: 'json' }).notNull().$type<AlertQuery[]>().default([]),
    condition: text('condition', { mode: 'json' }).notNull().$type<AlertCondition>(),
    labels: text('labels', { mode: 'json' }).notNull().$type<Record<string, string>>().default({}),
    annotations: text('annotations', { mode: 'json' }).notNull().$type<Record<string, string>>().default({}),
    forDurationS: integer('for_duration_s').notNull().default(0),
    noDataState: text('no_data_state').notNull().default('Alerting'),
    execErrState: text('exec_err_state').notNull().default('Alerting'),
    isPaused: integer('is_paused', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  table => [uniqueIndex('alert_rules_org_group_title_idx').on(table.orgId, table.groupId, table.title)],
);

export const alertInstances = sqliteTable(
  'alert_instances',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    ruleId: text('rule_id')
      .notNull()
      .references(() => alertRules.id, { onDelete: 'cascade' }),
    labelsHash: text('labels_hash').notNull(),
    labels: text('labels', { mode: 'json' }).notNull().$type<Record<string, string>>().default({}),
    state: text('state').notNull().default('Normal'),
    value: text('value').notNull().default(''),
    activeAt: integer('active_at', { mode: 'timestamp_ms' }),
    lastEvalAt: integer('last_eval_at', { mode: 'timestamp_ms' }).notNull(),
  },
  table => [uniqueIndex('alert_instances_rule_labels_idx').on(table.ruleId, table.labelsHash)],
);

export const contactPoints = sqliteTable(
  'contact_points',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    type: text('type').notNull(),
    settings: text('settings', { mode: 'json' }).notNull().$type<ContactPointSettings>(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  table => [uniqueIndex('contact_points_org_name_idx').on(table.orgId, table.name)],
);

export const notificationPolicies = sqliteTable('notification_policies', {
  id: text('id').primaryKey(),
  orgId: text('org_id')
    .notNull()
    .references(() => organizations.id),
  parentId: text('parent_id'),
  contactPointId: text('contact_point_id').references(() => contactPoints.id),
  groupBy: text('group_by', { mode: 'json' }).notNull().$type<string[]>().default(['alertname']),
  matchers: text('matchers', { mode: 'json' }).notNull().$type<LabelMatcher[]>().default([]),
  muteTimingIds: text('mute_timing_ids', { mode: 'json' }).notNull().$type<string[]>().default([]),
  groupWaitS: integer('group_wait_s').notNull().default(30),
  groupIntervalS: integer('group_interval_s').notNull().default(300),
  repeatIntervalS: integer('repeat_interval_s').notNull().default(14400),
  continueMatching: integer('continue_matching', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const silences = sqliteTable(
  'silences',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    matchers: text('matchers', { mode: 'json' }).notNull().$type<LabelMatcher[]>(),
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
    endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),
    comment: text('comment').notNull().default(''),
    createdBy: text('created_by').notNull().default(''),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  table => [index('silences_org_ends_idx').on(table.orgId, table.endsAt)],
);

export const muteTimings = sqliteTable(
  'mute_timings',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    intervals: text('intervals', { mode: 'json' }).notNull().$type<MuteTimeInterval[]>().default([]),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  table => [uniqueIndex('mute_timings_org_name_idx').on(table.orgId, table.name)],
);

export const annotations = sqliteTable(
  'annotations',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    dashboardId: text('dashboard_id').references(() => dashboards.id),
    panelId: text('panel_id'),
    alertRuleId: text('alert_rule_id').references(() => alertRules.id, { onDelete: 'cascade' }),
    time: integer('time', { mode: 'timestamp_ms' }).notNull(),
    timeEnd: integer('time_end', { mode: 'timestamp_ms' }),
    text: text('text').notNull(),
    tags: text('tags', { mode: 'json' }).notNull().$type<string[]>().default([]),
    prevState: text('prev_state'),
    newState: text('new_state'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  table => [index('annotations_org_dashboard_idx').on(table.orgId, table.dashboardId), index('annotations_org_rule_idx').on(table.orgId, table.alertRuleId)],
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
