import type { IntrospectedFields } from '../cf-graphql/introspection';

import type { DatasetOverride } from './overrides';
import type { DatasetConfig } from './registry';

const TIME_DIM_PRIORITY = [
	'datetimeMinute',
	'datetimeFiveMinutes',
	'datetimeFiveMinute',
	'datetimeFifteenMinutes',
	'datetimeHour',
	'datetime',
	'date',
];

const isTimeDimension = (field: string): boolean =>
	field.startsWith('datetime') || field === 'date';

const isResourceLike = (field: string): boolean =>
	field.endsWith('Name') || field.endsWith('Id') || field.endsWith('Tag');

const camelToKebab = (s: string): string =>
	s.replaceAll(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

const stripSuffix = (name: string): string =>
	name
		.replace(/AdaptiveGroups$/, '')
		.replace(/Adaptive$/, '')
		.replace(/Groups$/, '');

export const toDatasetName = (nodeName: string): string =>
	camelToKebab(stripSuffix(nodeName));

const pickTimeDimension = (
	dimensionFields: readonly string[],
	override: DatasetOverride | undefined,
): string | undefined => {
	if (override?.preferredTimeDim !== undefined) {
		return dimensionFields.includes(override.preferredTimeDim)
			? override.preferredTimeDim
			: undefined;
	}
	for (const candidate of TIME_DIM_PRIORITY) {
		if (dimensionFields.includes(candidate)) return candidate;
	}
	return undefined;
};

const pickResourceDimension = (
	dimensionFields: readonly string[],
	timeDim: string | undefined,
	override: DatasetOverride | undefined,
): string => {
	if (override?.resourceDimension !== undefined) return override.resourceDimension;
	return dimensionFields.find(
		(f) => !isTimeDimension(f) && isResourceLike(f) && f !== timeDim,
	) ?? '_all';
};

const buildMetrics = (
	fields: IntrospectedFields,
): DatasetConfig['metrics'] => {
	const metrics: { source: 'count' | 'sum' | 'quantiles' | 'avg' | 'max'; field?: string; name?: string }[] = [];

	if (fields.hasCount) {
		metrics.push({ source: 'count', name: 'count' });
	}
	for (const field of fields.metricBlocks.sum) {
		metrics.push({ source: 'sum', field });
	}
	for (const field of fields.metricBlocks.avg) {
		metrics.push({ source: 'avg', field });
	}
	for (const field of fields.metricBlocks.max) {
		metrics.push({ source: 'max', field });
	}
	for (const field of fields.metricBlocks.quantiles) {
		metrics.push({ source: 'quantiles', field });
	}

	return metrics;
};

export const schemaToConfig = (
	nodeName: string,
	scope: 'account' | 'zone',
	fields: IntrospectedFields,
	override: DatasetOverride | undefined,
): DatasetConfig | undefined => {
	const metrics = buildMetrics(fields);
	if (metrics.length === 0) return undefined;

	const timeDim = pickTimeDimension(fields.dimensionFields, override);
	const isDateFilter = timeDim === 'date';
	const filterField = isDateFilter ? 'date' : (timeDim ?? 'datetime');

	const resourceDim = pickResourceDimension(fields.dimensionFields, timeDim, override);

	const dimKeys = fields.dimensionFields.filter((f) => {
		if (isTimeDimension(f)) return false;
		if (f === resourceDim && resourceDim !== '_all') return false;
		return true;
	});

	const orderBy = override?.preferredOrderBy ?? (timeDim === undefined ? 'count_DESC' : `${timeDim}_ASC`);

	return {
		nodeName,
		datasetName: toDatasetName(nodeName),
		scope,
		time: timeDim === undefined
			? { kind: 'fromSeconds' }
			: isDateFilter
				? { kind: 'dateDimension', field: timeDim }
				: { kind: 'dimension', field: timeDim },
		filter: {
			kind: isDateFilter ? 'date' : 'time',
			filterField,
			...(override?.extraFilters !== undefined && { extraFilters: override.extraFilters }),
		},
		orderBy,
		limit: 10000,
		resourceDimension: resourceDim === '_all' && scope === 'zone' ? '_scopeId' : resourceDim,
		dimKeys,
		metrics,
	};
};
