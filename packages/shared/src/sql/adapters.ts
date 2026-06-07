import type { PrometheusResponse } from '#schemas/prometheus';
import type { SqlResponse } from '#schemas/sql';

export const sqlRowsToSeries = (response: SqlResponse): PrometheusResponse => {
	if (response.error !== undefined) {
		return { status: 'error', error: response.error };
	}

	const timeIdx = response.columns.findIndex(
		(c) => c.name.toLowerCase() === 'time',
	);
	if (timeIdx === -1) {
		return {
			status: 'error',
			errorType: 'bad_data',
			error: 'Query must include a column named "time" for time_series format',
		};
	}

	const numericCols: number[] = [];
	const labelCols: number[] = [];

	for (let ci = 0; ci < response.columns.length; ci++) {
		if (ci === timeIdx) continue;
		const col = response.columns[ci];
		if (col === undefined) continue;
		if (col.type === 'string') {
			labelCols.push(ci);
		} else {
			numericCols.push(ci);
		}
	}

	if (numericCols.length === 0) {
		for (let ci = 0; ci < response.columns.length; ci++) {
			if (ci === timeIdx) continue;
			if (labelCols.includes(ci)) continue;
			numericCols.push(ci);
		}
	}

	if (numericCols.length === 0) {
		return {
			status: 'success',
			data: { resultType: 'matrix', result: [] },
		};
	}

	const seriesMap = new Map<string, { metric: Record<string, string>; values: [number, string][] }>();

	for (const row of response.rows) {
		const ts = Number(row[timeIdx]);
		if (Number.isNaN(ts)) continue;

		const labels: Record<string, string> = {};
		for (const li of labelCols) {
			const v = row[li];
			const colDef = response.columns[li];
			if (v !== null && colDef !== undefined) {
				labels[colDef.name] = String(v);
			}
		}

		for (const ni of numericCols) {
			const v = row[ni];
			if (v === null) continue;
			const colDef = response.columns[ni];
			if (colDef === undefined) continue;

			const metric = { __name__: colDef.name, ...labels };
			const key = JSON.stringify(metric);

			let series = seriesMap.get(key);
			if (series === undefined) {
				series = { metric, values: [] };
				seriesMap.set(key, series);
			}
			series.values.push([ts, String(v)]);
		}
	}

	const result = [...seriesMap.values()];

	return {
		status: 'success',
		data: { resultType: 'matrix', result },
	};
};
