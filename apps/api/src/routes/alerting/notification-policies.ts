import type { AppEnv } from '../../index';

import { createNotificationPolicySchema, notificationPolicyIdParamSchema, updateNotificationPolicySchema } from '@graflare/shared/schemas/notification-policy';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { onValidationError } from '../../middleware/validate';

import * as notificationPolicyOps from './notification-policy-ops';

const app = new Hono<AppEnv>();

app.get('/', async c => {
  const rows = await notificationPolicyOps.listNotificationPolicies(createDb(c.env.DB), c.get('orgId'));
  return c.json(rows);
});

app.post('/', sValidator('json', createNotificationPolicySchema, onValidationError), async c => {
  const row = await notificationPolicyOps.createNotificationPolicy(createDb(c.env.DB), c.get('orgId'), c.req.valid('json'));
  return c.json(row, 201);
});

app.put(
  '/:id',
  sValidator('param', notificationPolicyIdParamSchema, onValidationError),
  sValidator('json', updateNotificationPolicySchema, onValidationError),
  async c => {
    const row = await notificationPolicyOps.updateNotificationPolicy(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id, c.req.valid('json'));
    if (row === null) {
      return c.json({ error: 'Not found' }, 404);
    }
    return c.json(row);
  },
);

app.delete('/:id', sValidator('param', notificationPolicyIdParamSchema, onValidationError), async c => {
  const deleted = await notificationPolicyOps.deleteNotificationPolicy(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id);
  if (!deleted) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.body(null, 204);
});

export { app as notificationPolicyRoutes };
