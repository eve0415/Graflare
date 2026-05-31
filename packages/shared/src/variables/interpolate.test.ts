import { describe, expect, it } from 'vitest';

import { interpolateVariables } from './interpolate';

// Build "${name}" at runtime to avoid triggering no-template-curly-in-string.
const braced = (name: string): string => ['$', '{', name, '}'].join('');

// Build "${name" (unclosed) at runtime.
const unclosed = (name: string): string => ['$', '{', name].join('');

describe('interpolateVariables', () => {
	it('replaces a single bare variable', () => {
		const vars = new Map([['job', 'prometheus']]);
		expect(interpolateVariables('up{job="$job"}', vars)).toBe(
			'up{job="prometheus"}',
		);
	});

	it('replaces multiple different variables', () => {
		const vars = new Map<string, string | string[]>([
			['job', 'node'],
			['instance', 'localhost:9090'],
		]);
		expect(
			interpolateVariables('up{job="$job", instance="$instance"}', vars),
		).toBe('up{job="node", instance="localhost:9090"}');
	});

	it('replaces braced syntax', () => {
		const vars = new Map([['metric', 'cpu_usage']]);
		expect(
			interpolateVariables(`${braced('metric')}_total`, vars),
		).toBe('cpu_usage_total');
	});

	it('joins multi-value variables with pipe', () => {
		const vars = new Map<string, string | string[]>([
			['instance', ['host1', 'host2', 'host3']],
		]);
		expect(interpolateVariables('up{instance=~"$instance"}', vars)).toBe(
			'up{instance=~"host1|host2|host3"}',
		);
	});

	it('joins multi-value variables in braced syntax', () => {
		const vars = new Map<string, string | string[]>([
			['env', ['staging', 'prod']],
		]);
		expect(
			interpolateVariables(`up{env=~"${braced('env')}"}`, vars),
		).toBe('up{env=~"staging|prod"}');
	});

	it('leaves unknown bare variables as-is', () => {
		const vars = new Map<string, string | string[]>();
		expect(interpolateVariables('$missing', vars)).toBe('$missing');
	});

	it('leaves unknown braced variables as-is', () => {
		const vars = new Map<string, string | string[]>();
		expect(interpolateVariables(braced('missing'), vars)).toBe(
			braced('missing'),
		);
	});

	it('replaces escaped $$ with a literal $', () => {
		const vars = new Map([['x', 'val']]);
		expect(interpolateVariables('cost is $$100 and $x', vars)).toBe(
			'cost is $100 and val',
		);
	});

	it('does not replace variables inside single-quoted strings', () => {
		const vars = new Map([['label', 'replaced']]);
		expect(
			interpolateVariables("metric{label=~'$label'} + $label", vars),
		).toBe("metric{label=~'$label'} + replaced");
	});

	it('handles $__interval special variable via map lookup', () => {
		const vars = new Map([['__interval', '15s']]);
		expect(interpolateVariables('rate(metric[$__interval])', vars)).toBe(
			'rate(metric[15s])',
		);
	});

	it('handles $__rate_interval special variable via map lookup', () => {
		const vars = new Map([['__rate_interval', '1m']]);
		expect(
			interpolateVariables('rate(metric[$__rate_interval])', vars),
		).toBe('rate(metric[1m])');
	});

	it('returns the expression unchanged with an empty map', () => {
		const vars = new Map<string, string | string[]>();
		const expr = 'up{job="prometheus"}';
		expect(interpolateVariables(expr, vars)).toBe(expr);
	});

	it('does not substitute a prefix when a longer variable name exists', () => {
		const vars = new Map<string, string | string[]>([['host', 'server1']]);
		// $hostname must NOT be partially replaced to "server1name"
		expect(interpolateVariables('$hostname', vars)).toBe('$hostname');
	});

	it('replaces both when shorter and longer names are in the map', () => {
		const vars = new Map<string, string | string[]>([
			['host', 'server1'],
			['hostname', 'server1.example.com'],
		]);
		expect(interpolateVariables('$host and $hostname', vars)).toBe(
			'server1 and server1.example.com',
		);
	});

	it('handles an unclosed brace as a literal $', () => {
		const vars = new Map([['foo', 'bar']]);
		const input = unclosed('foo');
		expect(interpolateVariables(input, vars)).toBe(input);
	});

	it('handles a lone trailing $', () => {
		const vars = new Map<string, string | string[]>();
		expect(interpolateVariables('end$', vars)).toBe('end$');
	});

	it('handles an empty expression', () => {
		const vars = new Map([['x', 'v']]);
		expect(interpolateVariables('', vars)).toBe('');
	});

	it('handles single-quoted string that opens and closes', () => {
		const vars = new Map([['x', 'replaced']]);
		expect(interpolateVariables("'$x' $x", vars)).toBe("'$x' replaced");
	});

	it('handles $ followed by a non-word character', () => {
		const vars = new Map<string, string | string[]>();
		expect(interpolateVariables('$!bang', vars)).toBe('$!bang');
	});

	it('handles adjacent $$ and variable', () => {
		const vars = new Map([['x', 'v']]);
		expect(interpolateVariables('$$$x', vars)).toBe('$v');
	});
});
