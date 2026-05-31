import * as z from 'zod/mini';

export const folderSchema = z.object({
  id: z.uuid(),
  orgId: z.string(),
  parentId: z.nullable(z.uuid()),
  title: z.string().check(z.minLength(1), z.maxLength(255)),
  slug: z.string().check(z.minLength(1), z.maxLength(255)),
  createdAt: z.int(),
  updatedAt: z.int(),
});

export type Folder = z.infer<typeof folderSchema>;

export const createFolderSchema = z.object({
  title: z.string().check(z.minLength(1), z.maxLength(255)),
  parentId: z._default(z.nullable(z.uuid()), null),
});

export type CreateFolder = z.infer<typeof createFolderSchema>;

export const updateFolderSchema = z.partial(createFolderSchema);

export type UpdateFolder = z.infer<typeof updateFolderSchema>;

export const folderIdParamSchema = z.object({ id: z.uuid() });

export const updateFolderInputSchema = z.object({
  id: z.uuid(),
  data: updateFolderSchema,
});

export type UpdateFolderInput = z.infer<typeof updateFolderInputSchema>;
