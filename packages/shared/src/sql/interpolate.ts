/**
 * Replace template variables (`$var`, `${var}`) in a SQL expression.
 *
 * - Multi-value variables are joined with `, ` for `IN (...)`.
 * - String values have single quotes doubled (`O'Brien` → `'O''Brien'`).
 * - Numeric values are not quoted.
 * - Content inside SQL string literals (`'...'`) is left untouched.
 * - `$$` is an escape for a literal `$`.
 * - Unknown variables are left as-is.
 */
export const interpolateSqlVariables = (
	sql: string,
	variables: Map<string, string | number | (string | number)[]>,
): string => {
	let result = '';
	let i = 0;
	let inQuote = false;

	while (i < sql.length) {
		const ch = sql[i];

		if (inQuote) {
			result += ch;
			if (ch === "'" && sql[i + 1] === "'") {
				result += "'";
				i += 2;
				continue;
			}
			if (ch === "'") {
				inQuote = false;
			}
			i++;
			continue;
		}

		if (ch === "'") {
			inQuote = true;
			result += ch;
			i++;
			continue;
		}

		if (ch === '$') {
			const next = sql[i + 1];

			if (next === '$') {
				result += '$';
				i += 2;
				continue;
			}

			if (next === '{') {
				const close = sql.indexOf('}', i + 2);
				if (close === -1) {
					result += ch;
					i++;
					continue;
				}
				const name = sql.slice(i + 2, close);
				const value = variables.get(name);
				if (value === undefined) {
					result += sql.slice(i, close + 1);
				} else {
					result += formatValue(value);
				}
				i = close + 1;
				continue;
			}

			const match = /^\w+/.exec(sql.slice(i + 1));
			if (match === null) {
				result += ch;
				i++;
				continue;
			}

			const [name] = match;
			const end = i + 1 + name.length;
			const value = variables.get(name);
			if (value === undefined) {
				result += sql.slice(i, end);
			} else {
				result += formatValue(value);
			}
			i = end;
			continue;
		}

		result += ch;
		i++;
	}

	return result;
};

const formatSingle = (v: string | number): string => {
	if (typeof v === 'number') return String(v);
	return `'${v.replaceAll("'", "''")}'`;
};

const formatValue = (v: string | number | (string | number)[]): string => {
	if (Array.isArray(v)) {
		return v.map((item) => formatSingle(item)).join(', ');
	}
	return formatSingle(v);
};
