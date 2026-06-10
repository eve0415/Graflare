/**
 * Cloudflare D1 caps a single prepared statement at 100 bound parameters; over that it rejects
 * the whole statement ("too many SQL variables") and zero rows land. A multi-row INSERT binds
 * `rows × columns` params, and Drizzle's `.values([...])` emits ONE statement — it does not
 * auto-chunk — so any data-driven multi-row insert must be split before it hits D1.
 *
 * This is the shared, tested split used by every such site (bridge metrics, alerting
 * annotations, …) so the "every insert rejects, zero rows land" regression can't recur per site.
 */
export const D1_MAX_BOUND_PARAMS = 100;

/**
 * Split `rows` into chunks small enough that a single multi-row INSERT stays under D1's
 * {@link D1_MAX_BOUND_PARAMS} ceiling. Each row binds `columnsPerRow` params, so the safe chunk
 * size is `floor(100 / columnsPerRow)`.
 *
 * `columnsPerRow` is passed explicitly (not derived from the data) and the first row is checked
 * against it: a schema change that adds a column without updating the caller's count fails loudly
 * here rather than silently pushing a chunk back over the limit. Rows are assumed homogeneous —
 * they come from a single `.map()` over query results — so checking the first is sufficient.
 *
 * Pure: returns the chunks and performs no IO, so the caller owns the (sequential) insert loop
 * and its conflict/return semantics.
 */
export const chunkRowsForD1 = <T extends Record<string, unknown>>(rows: readonly T[], columnsPerRow: number): T[][] => {
  if (!Number.isInteger(columnsPerRow) || columnsPerRow < 1) {
    throw new Error(`columnsPerRow must be a positive integer, got ${String(columnsPerRow)}`);
  }
  if (columnsPerRow > D1_MAX_BOUND_PARAMS) {
    throw new Error(`a single row binds ${String(columnsPerRow)} params, over D1's ${String(D1_MAX_BOUND_PARAMS)}-param limit — cannot chunk`);
  }

  const [first] = rows;
  if (first !== undefined && Object.keys(first).length !== columnsPerRow) {
    throw new Error(`row has ${String(Object.keys(first).length)} columns, expected ${String(columnsPerRow)} (chunk-size assumption broken)`);
  }

  const chunkSize = Math.floor(D1_MAX_BOUND_PARAMS / columnsPerRow);
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize));
  }
  return chunks;
};
