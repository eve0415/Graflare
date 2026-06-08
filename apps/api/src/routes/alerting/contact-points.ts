import type { AppEnv } from '../../index';
import type { ContactPointSettings } from '@graflare/shared/schemas/alerting';

import { contactPointIdParamSchema, createContactPointSchema, updateContactPointSchema } from '@graflare/shared/schemas/contact-point';
import { sValidator } from '@hono/standard-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { encryptCredentials } from '../../crypto/credentials';
import { createDb } from '../../db';
import { contactPoints } from '../../db/schema';
import { onValidationError } from '../../middleware/validate';

/** Sentinel the API returns in place of a stored webhook password; the edit form sends it back unchanged to keep the existing password. */
const REDACTED = '******';

const redactSettings = (settings: ContactPointSettings): ContactPointSettings => {
  if (settings.type !== 'webhook' || settings.password.length === 0) return settings;
  return { ...settings, password: REDACTED };
};

const encryptSettingsCredentials = async (settings: ContactPointSettings, encryptionKey: string): Promise<ContactPointSettings> => {
  if (settings.type !== 'webhook' || settings.password.length === 0) return settings;
  return { ...settings, password: await encryptCredentials(settings.password, encryptionKey) };
};

const app = new Hono<AppEnv>();

app.get('/', async c => {
  const db = createDb(c.env.DB);
  const orgId = c.get('orgId');

  const rows = await db.select().from(contactPoints).where(eq(contactPoints.orgId, orgId));
  return c.json(rows.map(r => Object.assign(r, { settings: redactSettings(r.settings) })));
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

  const [row] = rows;
  if (row === undefined) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({ ...row, settings: redactSettings(row.settings) });
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

  const [existingRow] = existing;
  if (existingRow === undefined) {
    return c.json({ error: 'Not found' }, 404);
  }

  const data = c.req.valid('json');
  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (data.name !== undefined) updates['name'] = data.name;
  if (data.type !== undefined) updates['type'] = data.type;
  if (data.settings !== undefined) {
    const incoming = data.settings;
    if (incoming.type === 'webhook' && incoming.password === REDACTED) {
      // Password unchanged in the form — keep the existing ENCRYPTED password, don't re-encrypt the sentinel.
      const prev = existingRow.settings;
      updates['settings'] = { ...incoming, password: prev.type === 'webhook' ? prev.password : '' };
    } else {
      updates['settings'] = await encryptSettingsCredentials(incoming, c.env.ENCRYPTION_KEY);
    }
  }

  await db
    .update(contactPoints)
    .set(updates)
    .where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)));

  const [updatedRow] = await db
    .select()
    .from(contactPoints)
    .where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)))
    .limit(1);
  if (updatedRow === undefined) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json({ ...updatedRow, settings: redactSettings(updatedRow.settings) });
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

  await db.delete(contactPoints).where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)));

  return c.body(null, 204);
});

export { app as contactPointRoutes };
