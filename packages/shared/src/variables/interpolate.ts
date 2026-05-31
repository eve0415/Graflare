/**
 * Replace template variables (`$var`, `${var}`) in a PromQL expression.
 *
 * - Multi-value variables are joined with `|` (regex alternation).
 * - Content inside single-quoted strings is left untouched.
 * - `$$` is an escape for a literal `$`.
 * - Unknown variables are left as-is.
 */
export const interpolateVariables = (
	expr: string,
	variables: Map<string, string | string[]>,
): string => {
	let result = '';
	let i = 0;
	let inQuote = false;

	while (i < expr.length) {
		const ch = expr[i];

		// --- single-quoted string (PromQL string literal) ---
		if (inQuote) {
			result += ch;
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

		// --- dollar sign ---
		if (ch === '$') {
			const next = expr[i + 1];

			// escaped $$  →  literal $
			if (next === '$') {
				result += '$';
				i += 2;
				continue;
			}

			// braced: ${name}
			if (next === '{') {
				const close = expr.indexOf('}', i + 2);
				if (close === -1) {
					// unclosed brace — emit literally
					result += ch;
					i++;
					continue;
				}
				const name = expr.slice(i + 2, close);
				const value = variables.get(name);
				if (value === undefined) {
					// unknown variable — leave original text
					result += expr.slice(i, close + 1);
				} else {
					result += Array.isArray(value) ? value.join('|') : value;
				}
				i = close + 1;
				continue;
			}

			// bare: $name  (word chars: [A-Za-z0-9_])
			const match = /^\w+/.exec(expr.slice(i + 1));
			if (match === null) {
				// lone $ with no identifier following
				result += ch;
				i++;
				continue;
			}

			const name = match[0];
			const end = i + 1 + name.length;
			const value = variables.get(name);
			if (value === undefined) {
				result += expr.slice(i, end);
			} else {
				result += Array.isArray(value) ? value.join('|') : value;
			}
			i = end;
			continue;
		}

		// --- ordinary character ---
		result += ch;
		i++;
	}

	return result;
};
