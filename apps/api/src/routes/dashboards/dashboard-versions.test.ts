import type { AppEnv } from '../../index';

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../../db';
import { dashboardVersions, dashboards, folders, organizations } from '../../db/schema';

import { dashboardVersionRoutes } from './dashboard-versions';
import { dashboardRoutes } from './dashboards';

const TEST_ORG_ID = 'org-test-123';
const TEST_ENCRYPTION_KEY = btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32))));

const testBindings: AppEnv['Bindings'] = {
  ...env,
  ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  ACCESS_TEAM_DOMAIN: 'test-team',
  ACCESS_AUD: 'test-aud',
};

// Read the dashboard wire shape (create/update responses).
const readDashboard = async (res: Response): Promise<{ id: string; title: string; slug: string; version: number }> => {
  const body: unknown = await res.json();
  if (
    typeof body === 'object' &&
    body !== null &&
    'id' in body &&
    'title' in body &&
    'slug' in body &&
    'version' in body &&
    typeof body.id === 'string' &&
    typeof body.title === 'string' &&
    typeof body.slug === 'string' &&
    typeof body.version === 'number'
  ) {
    return { id: body.id, title: body.title, slug: body.slug, version: body.version };
  }
  throw new Error('unexpected dashboard response shape');
};

// Read a version list item.
const readVersionList = async (res: Response): Promise<{ version: number; message: string; createdBy: string }[]> => {
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error('expected array');
  return body.map((item: unknown) => {
    if (
      typeof item === 'object' &&
      item !== null &&
      'version' in item &&
      'message' in item &&
      'createdBy' in item &&
      typeof item.version === 'number' &&
      typeof item.message === 'string' &&
      typeof item.createdBy === 'string'
    ) {
      return { version: item.version, message: item.message, createdBy: item.createdBy };
    }
    throw new Error('unexpected version list item shape');
  });
};

// Read a single version row.
const readVersion = async (res: Response): Promise<{ version: number; message: string; data: string }> => {
  const body: unknown = await res.json();
  if (
    typeof body === 'object' &&
    body !== null &&
    'version' in body &&
    'message' in body &&
    'data' in body &&
    typeof body.version === 'number' &&
    typeof body.message === 'string' &&
    typeof body.data === 'string'
  ) {
    return { version: body.version, message: body.message, data: body.data };
  }
  throw new Error('unexpected version response shape');
};

// Mount both dashboard and version routes on the same app (mirrors index.ts).
const createApp = () => {
  const app = new Hono<AppEnv>();
  app.use('/*', async (c, next) => {
    c.set('orgId', TEST_ORG_ID);
    c.set('user', { kind: 'user', email: 'test@example.com', name: 'Test' });
    await next();
  });
  app.route('/', dashboardRoutes);
  app.route('/', dashboardVersionRoutes);
  return app;
};

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

// Helper: create a dashboard and return its id.
const createDashboard = async (app: Hono<AppEnv>, title: string): Promise<{ id: string }> => {
  const res = await app.request(
    req('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }),
    {},
    testBindings,
  );
  return readDashboard(res);
};

// Helper: update a dashboard to bump the version.
const updateDashboard = async (app: Hono<AppEnv>, id: string, title: string, message: string): Promise<void> => {
  await app.request(
    req(`/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message }),
    }),
    {},
    testBindings,
  );
};

describe('dashboard version routes', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.delete(dashboardVersions);
    await db.delete(dashboards);
    await db.delete(folders);
    await db.delete(organizations);
    await db.insert(organizations).values({
      id: TEST_ORG_ID,
      name: 'Test Org',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('lists versions for a dashboard', async () => {
    const app = createApp();
    const { id } = await createDashboard(app, 'Versioned Dash');
    await updateDashboard(app, id, 'Versioned Dash v2', 'bump');

    const res = await app.request(req(`/${id}/versions`), {}, testBindings);
    expect(res.status).toBe(200);
    const list = await readVersionList(res);
    expect(list).toHaveLength(2);
    // Ordered descending by version
    expect(list[0]?.version).toBe(2);
    expect(list[1]?.version).toBe(1);
  });

  it('gets a specific version by number', async () => {
    const app = createApp();
    const { id } = await createDashboard(app, 'Get Version');

    const res = await app.request(req(`/${id}/versions/1`), {}, testBindings);
    expect(res.status).toBe(200);
    const ver = await readVersion(res);
    expect(ver.version).toBe(1);
    expect(ver.message).toBe('Initial version');
    expect(ver.data).toBeDefined();
  });

  it('restores a previous version (creates new version, updates dashboard)', async () => {
    const app = createApp();
    const { id } = await createDashboard(app, 'Original Title');
    await updateDashboard(app, id, 'Changed Title', 'changed');

    // Restore version 1
    const restoreRes = await app.request(req(`/${id}/versions/1/restore`, { method: 'POST' }), {}, testBindings);
    expect(restoreRes.status).toBe(200);
    const restored = await readDashboard(restoreRes);
    expect(restored.title).toBe('Original Title');
    expect(restored.version).toBe(3);

    // Verify a new version row was created
    const versionsRes = await app.request(req(`/${id}/versions`), {}, testBindings);
    const list = await readVersionList(versionsRes);
    expect(list).toHaveLength(3);
    expect(list[0]?.message).toBe('Restored from version 1');
  });

  it('returns 404 for versions of a nonexistent dashboard', async () => {
    const app = createApp();
    const res = await app.request(req('/550e8400-e29b-41d4-a716-446655440000/versions'), {}, testBindings);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a nonexistent version number', async () => {
    const app = createApp();
    const { id } = await createDashboard(app, 'Some Dash');

    const res = await app.request(req(`/${id}/versions/999`), {}, testBindings);
    expect(res.status).toBe(404);
  });

  it('rejects a malformed dashboard id on version list with 400', async () => {
    const app = createApp();
    const res = await app.request(req('/not-a-uuid/versions'), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('rejects a malformed dashboard id on version get with 400', async () => {
    const app = createApp();
    const res = await app.request(req('/not-a-uuid/versions/1'), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric version param with 400', async () => {
    const app = createApp();
    const { id } = await createDashboard(app, 'Bad Version');
    const res = await app.request(req(`/${id}/versions/abc`), {}, testBindings);
    expect(res.status).toBe(400);
  });
});
