import { dimsHash } from '../lib/dims-hash';
import { getNumberAtPath, getStringAtPath, isRecord } from '../lib/typed-access';

import type { MetricRow } from './types';
import type { DatasetConfig } from './registry';

const extractTimestamp = (config: DatasetConfig, item: unknown, fromSeconds: number): number | undefined => {
	if (config.time.kind === 'fromSeconds') {
		return fromSeconds;
	}

	const { field } = config.time;
	if (field === undefined) return undefined;

	const raw = getStringAtPath(item, 'dimensions', field);
	if (raw === undefined) return undefined;

	if (config.time.kind === 'dateDimension') {
		return Math.floor(new Date(`${raw}T00:00:00Z`).getTime() / 1000);
	}

	return Math.floor(new Date(raw).getTime() / 1000);
};

const extractResource = (config: DatasetConfig, item: unknown, scopeId: string): string | undefined => {
	if (config.resourceDimension === '_all') return '_all';
	if (config.resourceDimension === '_scopeId') return scopeId;
	return getStringAtPath(item, 'dimensions', config.resourceDimension);
};

const extractDims = (config: DatasetConfig, item: unknown): Record<string, string> | undefined => {
	const dims: Record<string, string> = {};
	for (const key of config.dimKeys) {
		const val = getStringAtPath(item, 'dimensions', key);
		if (val === undefined) return undefined;
		dims[key] = val;
	}
	return dims;
};

const extractMetricValue = (item: unknown, metric: DatasetConfig['metrics'][number]): number | undefined => {
	if (metric.source === 'count') {
		return getNumberAtPath(item, 'count');
	}
	if (metric.field === undefined) return undefined;
	return getNumberAtPath(item, metric.source, metric.field);
};

export const parseDataset = (
	config: DatasetConfig,
	data: unknown,
	scopeId: string,
	fromSeconds: number,
): MetricRow[] => {
	if (!Array.isArray(data)) return [];

	const rows: MetricRow[] = [];

	for (const item of data) {
		if (!isRecord(item)) continue;

		const ts = extractTimestamp(config, item, fromSeconds);
		if (ts === undefined) continue;

		const resource = extractResource(config, item, scopeId);
		if (resource === undefined) continue;

		const dims = extractDims(config, item);
		if (dims === undefined) continue;

		const hash = dimsHash(dims);

		for (const metric of config.metrics) {
			const value = extractMetricValue(item, metric);
			if (value === undefined) continue;

			const metricName = metric.name ?? metric.field ?? metric.source;

			rows.push({
				ts,
				dataset: config.datasetName,
				scope: config.scope,
				scopeId,
				resource,
				metricName,
				value,
				dims,
				dimsHash: hash,
			});
		}
	}

	return rows;
};
