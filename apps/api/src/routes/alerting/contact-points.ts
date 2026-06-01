import type { AppEnv } from '../../index';

import { contactPointIdParamSchema, createContactPointSchema, updateContactPointSchema } from '@graflare/shared/schemas/contact-point';
import { sValidator } from '@hono/standard-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { encryptCredentials } from '../../crypto/credentials';
import { createDb } from '../../db';
import { contactPoints } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';

function redactSettings(settings: Record<string, unknown>): Record<string, unknown> {
  if (settings['type'] !== 'webhook') return settings;
  const redacted = { ...settings };
  if (typeof redacted['password'] === 'string' && redacted['password'].length > 0) {
    redacted['password'] = '******';
  }
  return redacted;
}

async function encryptSettingsCredentials(settings: Record<string, unknown>, encryptionKey: string): Promise<Record<string, unknown>> {
  if (settings['type'] !== 'webhook') return settings;
  const encrypted = { ...settings };
  if (typeof encrypted['password'] === 'string' && encrypted['password'].length > 0) {
    encrypted['password'] = await encryptCredentials(encrypted['password'], encryptionKey);
  }
  return encrypted;
}

const app = new Hono<AppEnv>();

app.get('/', async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');

  const rows = await db.select().from(contactPoints).where(eq(contactPoints.orgId, orgId));
  return c.json(rows.map(r => ({ ...r, settings: redactSettings(r.settings) })));
});

app.get('/:id', sValidator('param', contactPointIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const rows = await db
    .select()
    .from(contactPoints)
    .where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({ ...rows[0], settings: redactSettings(rows[0].settings) });
});

app.post('/', sValidator('json', createContactPointSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const data = c.req.valid('json');

  const id = crypto.randomUUID();
  const now = new Date();

  const encryptedSettings = await encryptSettingsCredentials(data.settings, c.env.ENCRYPTION_KEY);

  await db.insert(contactPoints).values({
    id,
    orgId,
    name: data.name,
    type: data.type,
    settings: encryptedSettings,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ id, orgId, name: data.name, type: data.type, settings: redactSettings(data.settings), createdAt: now, updatedAt: now }, 201);
});

app.put('/:id', sValidator('param', contactPointIdParamSchema, onValidationError), sValidator('json', updateContactPointSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select()
    .from(contactPoints)
    .where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  const data = c.req.valid('json');
  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (data.name !== undefined) updates['name'] = data.name;
  if (data.type !== undefined) updates['type'] = data.type;
  if (data.settings !== undefined) {
    updates['settings'] = await encryptSettingsCredentials(data.settings, c.env.ENCRYPTION_KEY);
  }

  await db.update(contactPoints).set(updates).where(eq(contactPoints.id, id));

  const updated = await db.select().from(contactPoints).where(eq(contactPoints.id, id)).limit(1);
  return c.json({ ...updated[0], settings: redactSettings(updated[0].settings) });
});

app.delete('/:id', sValidator('param', contactPointIdParamSchema, onValidationError), async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');
  const { id } = c.req.valid('param');

  const existing = await db
    .select({ id: contactPoints.id })
    .from(contactPoints)
    .where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  await db.delete(contactPoints).where(eq(contactPoints.id, id));

  return c.body(null, 204);
});

export { app as contactPointRoutes };
