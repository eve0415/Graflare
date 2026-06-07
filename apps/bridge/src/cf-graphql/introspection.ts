import { isRecord } from '../lib/typed-access';

import { cfGraphQL } from './client';

export interface DatasetNode {
	nodeName: string;
	typeName: string;
	hasFilterArg: boolean;
}

export interface IntrospectedFields {
	hasCount: boolean;
	dimensionFields: string[];
	metricBlocks: {
		sum: string[];
		avg: string[];
		max: string[];
		quantiles: string[];
	};
}

const SCOPE_TYPE_NAMES: Record<string, string> = {
	account: 'account',
	zone: 'zone',
};

const SAFE_GQL_NAME = /^[A-Za-z_]\w*$/;

const unwrapType = (type: unknown): string | undefined => {
	if (!isRecord(type)) return undefined;
	if (typeof type['name'] === 'string' && type['kind'] === 'OBJECT') return type['name'];
	if ('ofType' in type) return unwrapType(type['ofType']);
	return undefined;
};

const isListType = (type: unknown): boolean => {
	if (!isRecord(type)) return false;
	if (type['kind'] === 'LIST') return true;
	if ('ofType' in type) return isListType(type['ofType']);
	return false;
};

const isDatasetField = (field: unknown): boolean => {
	if (!isRecord(field)) return false;
	if (field['isDeprecated'] === true) return false;
	if (unwrapType(field['type']) === undefined) return false;
	return isListType(field['type']);
};

export const discoverScopeDatasets = async (
	token: string,
	scope: 'account' | 'zone',
): Promise<DatasetNode[]> => {
	const scopeTypeName = SCOPE_TYPE_NAMES[scope];
	if (scopeTypeName === undefined) return [];

	const query = `{ __type(name: "${scopeTypeName}") { fields(includeDeprecated: false) { name isDeprecated args { name } type { name kind ofType { name kind ofType { name kind ofType { name kind } } } } } } }`;

	const response = await cfGraphQL<Record<string, unknown>>(token, query, {});
	if (response.data === null) return [];

	const { __type: typeData } = response.data;
	if (!isRecord(typeData)) return [];

	const { fields } = typeData;
	if (!Array.isArray(fields)) return [];

	const datasets: DatasetNode[] = [];
	for (const field of fields) {
		if (!isRecord(field)) continue;
		if (!isDatasetField(field)) continue;

		const { name } = field;
		if (typeof name !== 'string') continue;

		const typeName = unwrapType(field['type']);
		if (typeName === undefined) continue;

		const { args } = field;
		const hasFilterArg = Array.isArray(args)
			&& args.some((a: unknown) => isRecord(a) && a['name'] === 'filter');

		datasets.push({ nodeName: name, typeName, hasFilterArg });
	}

	return datasets;
};

const extractFieldNames = (data: Record<string, unknown>, key: string): string[] => {
	const block: unknown = data[key];
	if (!isRecord(block)) return [];
	const { fields } = block;
	if (!Array.isArray(fields)) return [];
	return fields
		.filter((f: unknown): f is Record<string, unknown> => isRecord(f) && typeof f['name'] === 'string')
		.map((f) => String(f['name']));
};

export const introspectDatasetFields = async (
	token: string,
	typeName: string,
): Promise<IntrospectedFields> => {
	const empty: IntrospectedFields = {
		hasCount: false,
		dimensionFields: [],
		metricBlocks: { sum: [], avg: [], max: [], quantiles: [] },
	};

	if (!SAFE_GQL_NAME.test(typeName)) return empty;

	const blocks = ['Dimensions', 'Sum', 'Avg', 'Max', 'Quantiles'];
	const aliases = blocks
		.map((b) => `${b.toLowerCase()}: __type(name: "${typeName}${b}") { fields { name } }`)
		.join(' ');

	const query = `{ root: __type(name: "${typeName}") { fields { name type { name kind } } } ${aliases} }`;
	const response = await cfGraphQL<Record<string, unknown>>(token, query, {});
	if (response.data === null) return empty;

	const rootData: unknown = response.data['root'];
	const rootFields: unknown = isRecord(rootData) ? rootData['fields'] : undefined;
	const hasCount = Array.isArray(rootFields)
		&& rootFields.some((f: unknown) => isRecord(f) && f['name'] === 'count');

	return {
		hasCount,
		dimensionFields: extractFieldNames(response.data, 'dimensions'),
		metricBlocks: {
			sum: extractFieldNames(response.data, 'sum'),
			avg: extractFieldNames(response.data, 'avg'),
			max: extractFieldNames(response.data, 'max'),
			quantiles: extractFieldNames(response.data, 'quantiles'),
		},
	};
};
