import type { DatasourceDialect } from '#schemas/datasource';

import { TIME_MULTIPLIERS } from '#time/resolve';

const COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const INTERVAL_RE = /^(\d+)([smhdw])$/;

export interface MacroResult {
  sql: string;
  params: (string | number)[];
}

const validateColumn = (name: string | undefined): string => {
  if (name === undefined || name.trim().length === 0) {
    throw new Error('Invalid column name: column name is required');
  }
  const trimmed = name.trim();
  if (!COLUMN_RE.test(trimmed)) {
    throw new Error(`Invalid column name: ${trimmed}`);
  }
  return trimmed;
};

const parseInterval = (interval: string): number => {
  const trimmed = interval.trim().replaceAll(/^'|'$/g, '');
  const match = INTERVAL_RE.exec(trimmed);
  if (match === null) {
    throw new Error(`Invalid interval: ${trimmed}`);
  }
  const [, amount, unit] = match;
  if (amount === undefined || unit === undefined) {
    throw new Error(`Invalid interval: ${trimmed}`);
  }
  const multiplier = TIME_MULTIPLIERS[unit];
  if (multiplier === undefined) {
    throw new Error(`Invalid interval unit: ${unit}`);
  }
  return Number(amount) * multiplier;
};

export interface EpochTimeRange {
  from: number;
  to: number;
}

type MacroHandler = (args: string[], dialect: DatasourceDialect, timeRange: EpochTimeRange, params: (string | number)[]) => string;

const macroTime: MacroHandler = args => {
  const col = validateColumn(args[0]);
  return `${col} AS "time"`;
};

const macroTimeFilter: MacroHandler = (args, _dialect, timeRange, params) => {
  const col = validateColumn(args[0]);
  params.push(timeRange.from, timeRange.to);
  return `${col} >= ? AND ${col} <= ?`;
};

const macroTimeFrom: MacroHandler = (_args, _dialect, timeRange, params) => {
  params.push(timeRange.from);
  return '?';
};

const macroTimeTo: MacroHandler = (_args, _dialect, timeRange, params) => {
  params.push(timeRange.to);
  return '?';
};

const macroTimeGroup: MacroHandler = (args, dialect, _timeRange, params) => {
  const col = validateColumn(args[0]);
  const [, intervalArg] = args;
  if (intervalArg === undefined) {
    throw new Error('Invalid interval: interval argument is required');
  }
  const seconds = parseInterval(intervalArg);
  if (dialect === 'postgres') {
    params.push(seconds, seconds);
    return `(EXTRACT(EPOCH FROM ${col})::integer / ?) * ?`;
  }
  params.push(seconds, seconds);
  return `(${col} / ?) * ?`;
};

// Grafana keeps $__timeFilter / $__unixEpochFilter (and the From/To pairs) as distinct macro
// names that historically differed in timestamp formatting; Graflare parameterizes both with the
// same bound values, so each pair shares one handler — distinct names, single implementation.
const MACROS: Record<string, MacroHandler> = {
  $__time: macroTime,
  $__timeFilter: macroTimeFilter,
  $__timeFrom: macroTimeFrom,
  $__timeTo: macroTimeTo,
  $__timeGroup: macroTimeGroup,
  $__unixEpochFilter: macroTimeFilter,
  $__unixEpochFrom: macroTimeFrom,
  $__unixEpochTo: macroTimeTo,
};

const MACRO_RE = /\$__(\w+)\(([^)]*)\)/g;

export const expandSqlMacros = (sql: string, dialect: DatasourceDialect, timeRange: EpochTimeRange): MacroResult => {
  const params: (string | number)[] = [];

  const expanded = sql.replace(MACRO_RE, (match, macroName: string, argsStr: string) => {
    const name = `$__${macroName}`;
    const handler = MACROS[name];
    if (handler === undefined) {
      return match;
    }
    const args = argsStr.length > 0 ? argsStr.split(',').map(a => a.trim()) : [];
    return handler(args, dialect, timeRange, params);
  });

  return { sql: expanded, params };
};
