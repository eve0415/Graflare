export type WhereOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL';

export type OrderDirection = 'ASC' | 'DESC';

export interface WhereClause {
	column: string;
	operator: WhereOperator;
	value: string;
}

export interface OrderByClause {
	column: string;
	direction: OrderDirection;
}

export interface SqlBuilderState {
	table: string;
	columns: string[];
	where: WhereClause[];
	groupBy: string[];
	orderBy: OrderByClause[];
	limit: number | undefined;
	timeColumn: string;
	timeGroupInterval: string;
}

const escapeString = (v: string): string => `'${v.replaceAll("'", "''")}'`;

const formatWhereCondition = (w: WhereClause): string => {
	if (w.operator === 'IS NULL' || w.operator === 'IS NOT NULL') {
		return `${w.column} ${w.operator}`;
	}
	if (w.operator === 'IN') {
		const items = w.value.split(',').map((s) => escapeString(s.trim()));
		return `${w.column} IN (${items.join(', ')})`;
	}
	return `${w.column} ${w.operator} ${escapeString(w.value)}`;
};

export const buildSql = (state: SqlBuilderState): string => {
	if (state.table === '') return '';

	const hasTimeGroup = state.timeColumn !== '' && state.timeGroupInterval !== '';
	const parts: string[] = [];

	// SELECT
	const selectCols: string[] = [];
	if (hasTimeGroup) {
		selectCols.push(`$__time(${state.timeColumn})`);
	}
	if (state.columns.length === 0) {
		selectCols.push('*');
	} else {
		selectCols.push(...state.columns);
	}
	parts.push(`SELECT ${selectCols.join(', ')}`);

	// FROM
	parts.push(`FROM ${state.table}`);

	// WHERE
	const whereClauses: string[] = [];
	if (state.timeColumn !== '') {
		whereClauses.push(`$__timeFilter(${state.timeColumn})`);
	}
	for (const w of state.where) {
		whereClauses.push(formatWhereCondition(w));
	}
	if (whereClauses.length > 0) {
		const [first, ...rest] = whereClauses;
		parts.push(`WHERE ${first}`);
		for (const clause of rest) {
			parts.push(`  AND ${clause}`);
		}
	}

	// GROUP BY
	const groupCols: string[] = [];
	if (hasTimeGroup) {
		groupCols.push(`$__timeGroup(${state.timeColumn}, ${state.timeGroupInterval})`);
	}
	groupCols.push(...state.groupBy);
	if (groupCols.length > 0) {
		parts.push(`GROUP BY ${groupCols.join(', ')}`);
	}

	// ORDER BY
	if (state.orderBy.length > 0) {
		const orderings = state.orderBy.map((o) => `${o.column} ${o.direction}`);
		parts.push(`ORDER BY ${orderings.join(', ')}`);
	}

	// LIMIT
	if (state.limit !== undefined) {
		parts.push(`LIMIT ${state.limit}`);
	}

	return parts.join('\n');
};
