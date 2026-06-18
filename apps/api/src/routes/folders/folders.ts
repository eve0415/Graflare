import type { AppEnv } from '../../index';

import { createFolderSchema, folderIdParamSchema, updateFolderSchema } from '@graflare/shared/schemas/folder';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';

import { createDb } from '../../db';
import { onValidationError } from '../../middleware/validate';

import * as folderOps from './folder-ops';

const app = new Hono<AppEnv>();

app.get('/', async c => {
  const rows = await folderOps.listFolders(createDb(c.env.DB), c.get('orgId'));
  return c.json(rows);
});

app.post('/', sValidator('json', createFolderSchema, onValidationError), async c => {
  const row = await folderOps.createFolder(createDb(c.env.DB), c.get('orgId'), c.req.valid('json'));
  return c.json(row, 201);
});

app.put('/:id', sValidator('param', folderIdParamSchema, onValidationError), sValidator('json', updateFolderSchema, onValidationError), async c => {
  const row = await folderOps.updateFolder(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id, c.req.valid('json'));
  if (row === null) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(row);
});

app.delete('/:id', sValidator('param', folderIdParamSchema, onValidationError), async c => {
  const deleted = await folderOps.deleteFolder(createDb(c.env.DB), c.get('orgId'), c.req.valid('param').id);
  if (!deleted) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.body(null, 204);
});

export { app as folderRoutes };
