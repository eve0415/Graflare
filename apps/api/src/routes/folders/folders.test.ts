import type { AppEnv } from '../../index';

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../../db';
import { dashboardVersions, dashboards, folders, organizations } from '../../db/schema';

import { folderRoutes } from './folders';

const TEST_ORG_ID = 'org-test-123';
const TEST_ENCRYPTION_KEY = btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32))));

const testBindings: AppEnv['Bindings'] = {
  ...env,
  ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  ACCESS_TEAM_DOMAIN: 'test-team',
  ACCESS_AUD: 'test-aud',
};

// Read wire-shape fields via narrowing (Dates serialize to ISO strings).
const readBody = async (
  res: Response,
): Promise<{
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
}> => {
  const body: unknown = await res.json();
  if (
    typeof body === 'object' &&
    body !== null &&
    'id' in body &&
    'title' in body &&
    'slug' in body &&
    typeof body.id === 'string' &&
    typeof body.title === 'string' &&
    typeof body.slug === 'string'
  ) {
    const parentId = 'parentId' in body && typeof body.parentId === 'string' ? body.parentId : null;
    return { id: body.id, title: body.title, slug: body.slug, parentId };
  }
  throw new Error('unexpected folder response shape');
};

const readList = async (res: Response): Promise<{ id: string; title: string; slug: string; parentId: string | null }[]> => {
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error('expected array');
  return body.map((item: unknown) => {
    if (
      typeof item === 'object' &&
      item !== null &&
      'id' in item &&
      'title' in item &&
      'slug' in item &&
      typeof item.id === 'string' &&
      typeof item.title === 'string' &&
      typeof item.slug === 'string'
    ) {
      const parentId = 'parentId' in item && typeof item.parentId === 'string' ? item.parentId : null;
      return { id: item.id, title: item.title, slug: item.slug, parentId };
    }
    throw new Error('unexpected list item shape');
  });
};

const createApp = () => {
  const app = new Hono<AppEnv>();
  app.use('/*', async (c, next) => {
    c.set('orgId', TEST_ORG_ID);
    c.set('user', { email: 'test@example.com', name: 'Test' });
    await next();
  });
  app.route('/', folderRoutes);
  return app;
};

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

describe('folder routes', () => {
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

  it('lists folders (empty)', async () => {
    const app = createApp();
    const res = await app.request(req('/'), {}, testBindings);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('creates a folder', async () => {
    const app = createApp();
    const res = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'My Folder' }),
      }),
      {},
      testBindings,
    );
    expect(res.status).toBe(201);
    const body = await readBody(res);
    expect(body.title).toBe('My Folder');
    expect(body.slug).toBe('my-folder');
    expect(body.parentId).toBeNull();
    expect(body.id).toBeDefined();
  });

  it('creates a nested folder (parentId)', async () => {
    const app = createApp();
    const parentRes = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Parent Folder' }),
      }),
      {},
      testBindings,
    );
    const parent = await readBody(parentRes);

    const childRes = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Child Folder', parentId: parent.id }),
      }),
      {},
      testBindings,
    );
    expect(childRes.status).toBe(201);
    const child = await readBody(childRes);
    expect(child.parentId).toBe(parent.id);
  });

  it('updates folder title (slug regenerated)', async () => {
    const app = createApp();
    const createRes = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Old Title' }),
      }),
      {},
      testBindings,
    );
    const created = await readBody(createRes);

    const res = await app.request(
      req(`/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Title' }),
      }),
      {},
      testBindings,
    );
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.title).toBe('New Title');
    expect(body.slug).toBe('new-title');
  });

  it('deletes a folder (children re-parented to grandparent)', async () => {
    const app = createApp();

    // Create grandparent -> parent -> child hierarchy
    const grandparentRes = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Grandparent' }),
      }),
      {},
      testBindings,
    );
    const grandparent = await readBody(grandparentRes);

    const parentRes = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Parent', parentId: grandparent.id }),
      }),
      {},
      testBindings,
    );
    const parent = await readBody(parentRes);

    const childRes = await app.request(
      req('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Child', parentId: parent.id }),
      }),
      {},
      testBindings,
    );
    const child = await readBody(childRes);

    // Delete the parent — child should be re-parented to grandparent
    const deleteRes = await app.request(req(`/${parent.id}`, { method: 'DELETE' }), {}, testBindings);
    expect(deleteRes.status).toBe(204);

    // Verify child's parentId is now the grandparent
    const listRes = await app.request(req('/'), {}, testBindings);
    const list = await readList(listRes);
    const updatedChild = list.find(f => f.id === child.id);
    expect(updatedChild?.parentId).toBe(grandparent.id);
  });

  it('returns 404 for a well-formed but nonexistent folder id on PUT', async () => {
    const app = createApp();
    const res = await app.request(
      req('/550e8400-e29b-41d4-a716-446655440000', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Nope' }),
      }),
      {},
      testBindings,
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for a well-formed but nonexistent folder id on DELETE', async () => {
    const app = createApp();
    const res = await app.request(req('/550e8400-e29b-41d4-a716-446655440000', { method: 'DELETE' }), {}, testBindings);
    expect(res.status).toBe(404);
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
});
