import type { DatasetConfig } from './registry';

const buildFilterClause = (config: DatasetConfig): string => {
  const parts: string[] = [];

  if (config.filter.kind === 'time') {
    parts.push(`${config.filter.filterField}_geq: $fromTime`);
    parts.push(`${config.filter.filterField}_leq: $toTime`);
  } else {
    parts.push(`${config.filter.filterField}_geq: $fromDate`);
    parts.push(`${config.filter.filterField}_leq: $toDate`);
  }

  if (config.filter.extraFilters !== undefined) {
    for (const [key, value] of Object.entries(config.filter.extraFilters)) {
      parts.push(`${key}: ${value}`);
    }
  }

  return parts.join(', ');
};

const collectDimensionFields = (config: DatasetConfig): string[] => {
  const fields = new Set<string>();

  if (config.time.field !== undefined) {
    fields.add(config.time.field);
  }

  for (const key of config.dimKeys) {
    if (key !== config.time.field) {
      fields.add(key);
    }
  }

  if (config.resourceDimension !== '_all' && config.resourceDimension !== '_scopeId' && !fields.has(config.resourceDimension)) {
    fields.add(config.resourceDimension);
  }

  return [...fields];
};

const buildMetricBlocks = (config: DatasetConfig): string[] => {
  const blocks: string[] = [];
  const grouped = new Map<string, string[]>();

  for (const metric of config.metrics) {
    if (metric.source === 'count') {
      blocks.push('count');
      continue;
    }

    const existing = grouped.get(metric.source) ?? [];
    if (metric.field !== undefined) {
      existing.push(metric.field);
    }
    grouped.set(metric.source, existing);
  }

  for (const [source, fields] of grouped) {
    if (fields.length > 0) {
      blocks.push(`${source} { ${fields.join(' ')} }`);
    }
  }

  return blocks;
};

export const buildFragment = (config: DatasetConfig): string => {
  const alias = buildAlias(config);
  const filter = buildFilterClause(config);
  const dimFields = collectDimensionFields(config);
  const metricBlocks = buildMetricBlocks(config);

  const parts = [];
  if (dimFields.length > 0) {
    parts.push(`dimensions { ${dimFields.join(' ')} }`);
  }
  parts.push(...metricBlocks);

  return `${alias}: ${config.nodeName}(
  filter: { ${filter} }
  limit: ${String(config.limit)}
  orderBy: [${config.orderBy}]
) {
  ${parts.join('\n  ')}
}`;
};

export const buildAlias = (config: DatasetConfig): string => config.datasetName.replaceAll(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());

export const buildTimeVarType = (config: DatasetConfig): 'Time' | 'Date' => (config.filter.kind === 'time' ? 'Time' : 'Date');
