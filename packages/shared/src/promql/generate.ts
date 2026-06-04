import { catalogByName } from './catalog';
import type { PromQLBuilderState } from './types';

const buildSelector = (state: PromQLBuilderState): string => {
	const matchers = state.labels
		.filter((l) => l.label !== '' && l.value !== '')
		.map((l) => `${l.label}${l.operator}"${l.value}"`);

	if (matchers.length === 0) return state.metric;
	if (state.metric === '') return `{${matchers.join(', ')}}`;
	return `${state.metric}{${matchers.join(', ')}}`;
};

export const generatePromQL = (state: PromQLBuilderState): string => {
	if (state.metric === '' && state.labels.length === 0) return '';

	let expr = buildSelector(state);

	for (const fn of state.functions) {
		const entry = catalogByName.get(fn.name);
		if (entry === undefined) continue;
		expr = entry.render(expr, fn.params);
	}

	return expr;
};
