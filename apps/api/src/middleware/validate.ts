import type { sValidator } from '@hono/standard-validator';

// Shared failure hook for @hono/standard-validator. Preserves the API's existing
// 400 body ({ error, details }) so route tests that assert that shape keep
// passing. Typed off sValidator's own hook parameter so we avoid a direct
// @standard-schema/spec import (a phantom dep under strict pnpm). On failure
// `result.error` is the StandardSchemaV1 issues array; on success we return
// undefined so Hono proceeds to the handler.
type ValidationHook = NonNullable<Parameters<typeof sValidator>[2]>;

export const onValidationError: ValidationHook = (result, c) =>
  result.success ? undefined : c.json({ error: 'Validation failed', details: result.error }, 400);
