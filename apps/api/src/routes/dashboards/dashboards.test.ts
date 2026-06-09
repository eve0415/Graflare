import type { AppEnv } from '../../index';

import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../../db';
import { dashboardVersions, dashboards, folders, organizations } from '../../db/schema';

import { dashboardRoutes } from './dashboards';

const TEST_ORG_ID = 'org-test-123';
const TEST_ENCRYPTION_KEY = btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32))));

const testBindings: AppEnv['Bindings'] = {
  ...env,
  ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  ACCESS_TEAM_DOMAIN: 'test-team',
  ACCESS_AUD: 'test-aud',
};

// Read wire-shape fields via narrowing (Dates serialize to ISO strings, so the
// full zod schema does not match the JSON wire format).
const readBody = async (
  res: Response,
): Promise<{
  id: string;
  title: string;
  slug: string;
  version: number;
  tags: string[];
  folderId: string | null;
}> => {
  const body: unknown = await res.json();
  if (
    typeof body === 'object' &&
    body !== null &&
    'id' in body &&
    'title' in body &&
    'slug' in body &&
    'version' in body &&
    'tags' in body &&
    typeof body.id === 'string' &&
    typeof body.title === 'string' &&
    typeof body.slug === 'string' &&
    typeof body.version === 'number' &&
    Array.isArray(body.tags)
  ) {
    const folderId = 'folderId' in body && typeof body.folderId === 'string' ? body.folderId : null;
    const tags = body.tags.filter((t): t is string => typeof t === 'string');
    return { id: body.id, title: body.title, slug: body.slug, version: body.version, tags, folderId };
  }
  throw new Error('unexpected dashboard response shape');
};

const readFullBody = async (
  res: Response,
): Promise<{
  id: string;
  title: string;
  slug: string;
  version: number;
  tags: string[];
  folderId: string | null;
  panels: unknown[];
  variables: unknown[];
  timeRange: { from: string; to: string; refresh: string | null };
}> => {
  const body: unknown = await res.json();
  if (
    typeof body === 'object' &&
    body !== null &&
    'id' in body &&
    'title' in body &&
    'slug' in body &&
    'version' in body &&
    'tags' in body &&
    'panels' in body &&
    'variables' in body &&
    'timeRange' in body &&
    typeof body.id === 'string' &&
    typeof body.title === 'string' &&
    typeof body.slug === 'string' &&
    typeof body.version === 'number' &&
    Array.isArray(body.tags) &&
    Array.isArray(body.panels) &&
    Array.isArray(body.variables) &&
    typeof body.timeRange === 'object' &&
    body.timeRange !== null &&
    'from' in body.timeRange &&
    'to' in body.timeRange
  ) {
    const folderId = 'folderId' in body && typeof body.folderId === 'string' ? body.folderId : null;
    const tr = body.timeRange;
    const refresh = 'refresh' in tr && typeof tr.refresh === 'string' ? tr.refresh : null;
    return {
      id: body.id,
      title: body.title,
      slug: body.slug,
      version: body.version,
      tags: body.tags.filter((t): t is string => typeof t === 'string'),
      folderId,
      panels: body.panels,
      variables: body.variables,
      timeRange: {
        from: typeof tr.from === 'string' ? tr.from : '',
        to: typeof tr.to === 'string' ? tr.to : '',
        refresh,
      },
    };
  }
  throw new Error('unexpected full dashboard response shape');
};

const readList = async (res: Response): Promise<{ id: string; title: string; slug: string; tags: string[] }[]> => {
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error('expected array');
  return body.map((item: unknown) => {
    if (
      typeof item === 'object' &&
      item !== null &&
      'id' in item &&
      'title' in item &&
      'slug' in item &&
      'tags' in item &&
      typeof item.id === 'string' &&
      typeof item.title === 'string' &&
      typeof item.slug === 'string' &&
      Array.isArray(item.tags)
    ) {
      return { id: item.id, title: item.title, slug: item.slug, tags: item.tags };
    }
    throw new Error('unexpected list item shape');
  });
};

const createApp = () => {
  const app = new Hono<AppEnv>();
  app.use('/*', async (c, next) => {
    c.set('orgId', TEST_ORG_ID);
    c.set('user', { kind: 'user', email: 'test@example.com', name: 'Test' });
    await next();
  });
  app.route('/', dashboardRoutes);
  return app;
};

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

describe('dashboard routes', () => {
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

  it('lists dashboards (empty)', async () => {
    const app = createApp();
    const res = await app.request(req('/'), {}, testBindings);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('creates a dashboard (title -> slug, version 1)', async () => {
    const app = createApp();
    const res = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'My Dashboard' }),
      }),
      {},
      testBindings,
    );
    expect(res.status).toBe(201);
    const body = await readBody(res);
    expect(body.title).toBe('My Dashboard');
    expect(body.slug).toBe('my-dashboard');
    expect(body.version).toBe(1);
    expect(body.id).toBeDefined();
  });

  it('auto-creates a version 1 row on dashboard create', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Versioned' }),
      }),
      {},
      testBindings,
    );
    const created = await readBody(createRes);

    const db = createDb(env.DB);
    const versions = await db.select().from(dashboardVersions).where(eq(dashboardVersions.dashboardId, created.id));
    expect(versions).toHaveLength(1);
    expect(versions[0]?.version).toBe(1);
  });

  it('gets a dashboard by id (includes panels, variables, timeRange)', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Full Get',
          timeRange: { from: 'now-6h', to: 'now', refresh: '30s' },
        }),
      }),
      {},
      testBindings,
    );
    const created = await readBody(createRes);

    const res = await app.request(req(`/${created.id}`), {}, testBindings);
    expect(res.status).toBe(200);
    const body = await readFullBody(res);
    expect(body.title).toBe('Full Get');
    expect(body.panels).toEqual([]);
    expect(body.variables).toEqual([]);
    expect(body.timeRange).toEqual({ from: 'now-6h', to: 'now', refresh: '30s' });
  });

  it('updates a dashboard (increments version, creates version row)', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Before Update' }),
      }),
      {},
      testBindings,
    );
    const created = await readBody(createRes);

    const res = await app.request(
      req(`/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'After Update', message: 'updated title' }),
      }),
      {},
      testBindings,
    );
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.title).toBe('After Update');
    expect(body.slug).toBe('after-update');
    expect(body.version).toBe(2);

    const db = createDb(env.DB);
    const versions = await db.select().from(dashboardVersions).where(eq(dashboardVersions.dashboardId, created.id));
    expect(versions).toHaveLength(2);
  });

  it('deletes a dashboard (cascades to versions)', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'To Delete' }),
      }),
      {},
      testBindings,
    );
    const created = await readBody(createRes);

    const res = await app.request(req(`/${created.id}`, { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(204);

    const getRes = await app.request(req(`/${created.id}`), {}, testBindings);
    expect(getRes.status).toBe(404);

    // Verify cascade deleted the version rows
    const db = createDb(env.DB);
    const versions = await db.select().from(dashboardVersions).where(eq(dashboardVersions.dashboardId, created.id));
    expect(versions).toHaveLength(0);
  });

  it('searches dashboards by title', async () => {
    const app = createApp();
    await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Production Metrics' }),
      }),
      {},
      testBindings,
    );
    await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Staging Logs' }),
      }),
      {},
      testBindings,
    );

    const res = await app.request(req('/?search=Prod'), {}, testBindings);
    expect(res.status).toBe(200);
    const list = await readList(res);
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe('Production Metrics');
  });

  it('filters dashboards by tag', async () => {
    const app = createApp();
    await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Tagged One', tags: ['infra', 'prod'] }),
      }),
      {},
      testBindings,
    );
    await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Tagged Two', tags: ['dev'] }),
      }),
      {},
      testBindings,
    );

    const res = await app.request(req('/?tag=infra'), {}, testBindings);
    expect(res.status).toBe(200);
    const list = await readList(res);
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe('Tagged One');
  });

  it('returns 404 for a well-formed but nonexistent dashboard id', async () => {
    const app = createApp();
    const res = await app.request(req('/550e8400-e29b-41d4-a716-446655440000'), {}, testBindings);
    expect(res.status).toBe(404);
  });

  it('rejects a malformed id on GET with 400', async () => {
    const app = createApp();
    const res = await app.request(req('/not-a-uuid'), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('rejects a malformed id on PUT with 400', async () => {
    const app = createApp();
    const res = await app.request(
      req('/not-a-uuid', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x' }) }),
      {},
      testBindings,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a malformed id on DELETE with 400', async () => {
    const app = createApp();
    const res = await app.request(req('/not-a-uuid', { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(400);
  });

  it('rejects invalid create input (empty title)', async () => {
    const app = createApp();
    const res = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      }),
      {},
      testBindings,
    );
    expect(res.status).toBe(400);
  });

  it('rejects create with no body', async () => {
    const app = createApp();
    const res = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      {},
      testBindings,
    );
    expect(res.status).toBe(400);
  });
});
