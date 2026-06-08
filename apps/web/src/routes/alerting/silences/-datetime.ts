// Convert a `<input type="datetime-local">` value to an epoch timestamp for the
// silence API. The API/D1 store silences in `timestamp_ms` columns and build the
// stored value with `new Date(value)`, so this MUST return milliseconds.
export const toEpoch = (dt: string): number => {
  const ms = new Date(dt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};
