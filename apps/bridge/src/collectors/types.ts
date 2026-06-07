import type { BridgeEnv } from '../env';

export interface MetricRow {
	ts: number;
	dataset: string;
	scope: 'account' | 'zone';
	scopeId: string;
	resource: string;
	metricName: string;
	value: number;
	dims: Record<string, string>;
	dimsHash: string;
}

export interface GraphQLCollector {
	kind: 'graphql';
	name: string;
	nodeName: string;
	scope: 'account' | 'zone';
	alias: string;
	fragment: string;
	timeVarType: 'Time' | 'Date';
	parse: (data: unknown, scopeId: string, fromSeconds: number) => MetricRow[];
}

export interface RESTCollector {
	kind: 'rest';
	name: string;
	scope: 'account';
	minIntervalSeconds: number;
	run: (env: BridgeEnv, from: string, to: string) => Promise<MetricRow[]>;
}

export type Collector = GraphQLCollector | RESTCollector;
