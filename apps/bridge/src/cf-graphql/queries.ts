interface MetricRow {
	ts: number;
	dataset: string;
	resource: string;
	metricName: string;
	value: number;
	dims: Record<string, string>;
}

interface WorkersNode {
	dimensions: { scriptName: string; datetimeMinute: string };
	sum: { requests: number; errors: number; subrequests: number; wallTime: number };
	quantiles: { cpuTimeP50: number; cpuTimeP99: number };
}

interface WorkersData {
	viewer: {
		accounts: {
			workersInvocationsAdaptive: WorkersNode[];
		}[];
	};
}

export const WORKERS_QUERY = `
query WorkersMetrics($accountId: String!, $from: Time!, $to: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountId }) {
      workersInvocationsAdaptive(
        filter: { datetimeMinute_geq: $from, datetimeMinute_leq: $to }
        limit: 10000
        orderBy: [datetimeMinute_ASC]
      ) {
        dimensions { scriptName datetimeMinute }
        sum { requests errors subrequests wallTime }
        quantiles { cpuTimeP50 cpuTimeP99 }
      }
    }
  }
}`;

export const parseWorkersResponse = (data: WorkersData): MetricRow[] => {
	const rows: MetricRow[] = [];
	const { accounts } = data.viewer;
	if (accounts.length === 0) return rows;

	const [account] = accounts;
	if (account === undefined) return rows;

	for (const node of account.workersInvocationsAdaptive) {
		const ts = Math.floor(new Date(node.dimensions.datetimeMinute).getTime() / 1000);
		const resource = node.dimensions.scriptName;
		const dims = { scriptName: resource };

		const metricValues: Record<string, number> = {
			requests: node.sum.requests,
			errors: node.sum.errors,
			subrequests: node.sum.subrequests,
			wallTime: node.sum.wallTime,
			cpuTimeP50: node.quantiles.cpuTimeP50,
			cpuTimeP99: node.quantiles.cpuTimeP99,
		};

		for (const [metricName, value] of Object.entries(metricValues)) {
			rows.push({ ts, dataset: 'workers', resource, metricName, value, dims });
		}
	}

	return rows;
};

export type { MetricRow, WorkersData };
