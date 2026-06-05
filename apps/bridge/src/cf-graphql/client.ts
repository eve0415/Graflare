export interface GraphQLError {
	message: string;
	path?: readonly (string | number)[];
	extensions?: Record<string, unknown>;
}

export interface GraphQLResponse<T> {
	data: T | null;
	errors?: GraphQLError[];
}

const isGraphQLError = (v: unknown): v is GraphQLError =>
	typeof v === 'object'
	&& v !== null
	&& 'message' in v
	&& typeof v.message === 'string';

const isGraphQLResponse = <T>(json: unknown): json is GraphQLResponse<T> =>
	typeof json === 'object'
	&& json !== null
	&& 'data' in json
	&& (!('errors' in json) || (Array.isArray(json.errors) && json.errors.every(isGraphQLError)));

export type ErrorClass = 'permission' | 'validation' | 'rate_limit' | 'server' | 'unknown';

export const classifyError = (error: GraphQLError): ErrorClass => {
	const msg = error.message.toLowerCase();
	if (
		msg.includes('permission')
		|| msg.includes('unauthorized')
		|| msg.includes('not authorized')
		|| msg.includes('authorization denied')
		|| msg.includes('access denied')
		|| msg.includes('returned 401')
		|| msg.includes('returned 403')
	) {
		return 'permission';
	}
	if (
		msg.includes('validation')
		|| msg.includes('unknown field')
		|| msg.includes('cannot query field')
	) {
		return 'validation';
	}
	if (msg.includes('rate limit') || msg.includes('returned 429')) {
		return 'rate_limit';
	}
	if (/returned 5\d\d/.test(msg)) {
		return 'server';
	}
	return 'unknown';
};

export const isPermissionError = (error: GraphQLError): boolean =>
	classifyError(error) === 'permission';

export interface CfGraphQLOptions {
	debug?: boolean;
}

export const cfGraphQL = async <T>(
	token: string,
	query: string,
	variables: Record<string, unknown>,
	options?: CfGraphQLOptions,
): Promise<GraphQLResponse<T>> => {
	const debug = options?.debug === true;

	if (debug) {
		console.log(JSON.stringify({
			level: 'debug',
			event: 'graphql_request',
			query: query.length > 500 ? `${query.slice(0, 500)}…` : query,
			variables,
		}));
	}

	const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ query, variables }),
		signal: AbortSignal.timeout(30_000),
	});

	if (debug) {
		console.log(JSON.stringify({
			level: 'debug',
			event: 'graphql_response_status',
			status: res.status,
		}));
	}

	if (!res.ok) {
		const result: GraphQLResponse<T> = { data: null, errors: [{ message: `CF API returned ${String(res.status)}` }] };
		if (debug) {
			const body = await res.text().catch(() => '(unreadable)');
			console.log(JSON.stringify({
				level: 'debug',
				event: 'graphql_error_body',
				body: body.slice(0, 2000),
			}));
		}
		return result;
	}

	const json: unknown = await res.json();

	if (debug) {
		const parsed = JSON.stringify(json);
		console.log(JSON.stringify({
			level: 'debug',
			event: 'graphql_response_body',
			body: parsed.length > 2000 ? `${parsed.slice(0, 2000)}…` : parsed,
		}));
	}

	if (!isGraphQLResponse<T>(json)) {
		return { data: null, errors: [{ message: 'Invalid response' }] };
	}

	if (debug && json.errors !== undefined && json.errors.length > 0) {
		console.log(JSON.stringify({
			level: 'debug',
			event: 'graphql_errors',
			errors: json.errors,
		}));
	}

	return json;
};
