import * as z from 'zod/mini';

// Datasource IDs are crypto.randomUUID() (RFC 9562 v4).
export const datasourceIdSchema = z.uuid();

export const dashboardIdSchema = z.uuid();

export const folderIdSchema = z.uuid();

// Org IDs are `org-` + 32 lowercase hex chars (SHA-256 truncated to 128 bits),
// produced by emailToOrgId() in apps/api/src/middleware/org.ts. NOT a UUID.
export const orgIdSchema = z.string().check(z.regex(/^org-[0-9a-f]{32}$/));
