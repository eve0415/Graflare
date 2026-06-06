import { dimsHash } from '../lib/dims-hash';
import { isRecord } from '../lib/typed-access';

import type { MetricRow, RESTCollector } from './types';

const isUsageItem = (v: unknown): v is {
	serviceName: string;
	billingCurrency: string;
	consumedQuantity: number;
	contractedCost: number;
} =>
	isRecord(v)
	&& 'serviceName' in v
	&& typeof v.serviceName === 'string'
	&& 'billingCurrency' in v
	&& typeof v.billingCurrency === 'string'
	&& 'consumedQuantity' in v
	&& typeof v.consumedQuantity === 'number'
	&& 'contractedCost' in v
	&& typeof v.contractedCost === 'number';


// Alpha endpoint with restricted access — may 403 on some accounts.
// The datasetStatus skip/retry logic handles this gracefully.
const runBilling = async (env: { CF_API_TOKEN: string; CF_ACCOUNT_ID: string }, from: string, to: string): Promise<MetricRow[]> => {
	const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/paygo-usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

	const res = await fetch(url, {
		headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` },
		signal: AbortSignal.timeout(30_000),
	});

	if (!res.ok) {
		throw new Error(`Billing API returned ${String(res.status)}`);
	}

	const json: unknown = await res.json();
	if (!isRecord(json) || !('result' in json)) return [];

	const { result } = json;
	if (!Array.isArray(result)) return [];

	const ts = Math.floor(new Date(from).getTime() / 1000);
	const rows: MetricRow[] = [];

	for (const item of result) {
		if (!isUsageItem(item)) continue;

		const dims = { serviceName: item.serviceName, billingCurrency: item.billingCurrency };
		const hash = dimsHash(dims);

		rows.push({
			ts,
			dataset: 'billing',
			scope: 'account',
			scopeId: env.CF_ACCOUNT_ID,
			resource: item.serviceName,
			metricName: 'consumedQuantity',
			value: item.consumedQuantity,
			dims,
			dimsHash: hash,
		});

		rows.push({
			ts,
			dataset: 'billing',
			scope: 'account',
			scopeId: env.CF_ACCOUNT_ID,
			resource: item.serviceName,
			metricName: 'contractedCost',
			value: item.contractedCost,
			dims,
			dimsHash: hash,
		});
	}

	return rows;
};

export const billingCollector: RESTCollector = {
	kind: 'rest',
	name: 'billing',
	scope: 'account',
	minIntervalSeconds: 3600,
	run: runBilling,
};
