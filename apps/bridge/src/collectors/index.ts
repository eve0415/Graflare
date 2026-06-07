import { billingCollector } from './billing';
import { buildAlias, buildFragment, buildTimeVarType } from './generic-fragment';
import { parseDataset } from './generic-parser';
import type { DatasetConfig } from './registry';
import type { GraphQLCollector, RESTCollector } from './types';

export const toCollector = (config: DatasetConfig): GraphQLCollector => ({
	kind: 'graphql',
	name: config.datasetName,
	scope: config.scope,
	alias: buildAlias(config),
	fragment: buildFragment(config),
	timeVarType: buildTimeVarType(config),
	parse: (data, scopeId, fromSeconds) => parseDataset(config, data, scopeId, fromSeconds),
});

export const REST_COLLECTORS: RESTCollector[] = [billingCollector];

export type { DatasetConfig } from './registry';
export type { Collector, GraphQLCollector, MetricRow, RESTCollector } from './types';
