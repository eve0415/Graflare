import { billingCollector } from './billing';
import { buildAlias, buildFragment, buildTimeVarType } from './generic-fragment';
import { parseDataset } from './generic-parser';
import { REGISTRY } from './registry';
import type { DatasetConfig } from './registry';
import type { GraphQLCollector, RESTCollector } from './types';

const toCollector = (config: DatasetConfig): GraphQLCollector => ({
	kind: 'graphql',
	name: config.datasetName,
	scope: config.scope,
	alias: buildAlias(config),
	fragment: buildFragment(config),
	timeVarType: buildTimeVarType(config),
	parse: (data, scopeId, fromSeconds) => parseDataset(config, data, scopeId, fromSeconds),
});

export const ACCOUNT_GRAPHQL_COLLECTORS: GraphQLCollector[] = REGISTRY
	.filter((c) => c.scope === 'account')
	.map((c) => toCollector(c));

export const ZONE_GRAPHQL_COLLECTORS: GraphQLCollector[] = REGISTRY
	.filter((c) => c.scope === 'zone')
	.map((c) => toCollector(c));

export const REST_COLLECTORS: RESTCollector[] = [billingCollector];

export { REGISTRY, toCollector };
export type { DatasetConfig } from './registry';
export type { Collector, GraphQLCollector, MetricRow, RESTCollector } from './types';
