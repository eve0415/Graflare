interface GraphQLResponse<T> {
	data: T | null;
	errors?: { message: string }[];
}

const isGraphQLResponse = <T>(json: unknown): json is GraphQLResponse<T> =>
	typeof json === 'object'
	&& json !== null
	&& 'data' in json;

export const cfGraphQL = async <T>(
	token: string,
	query: string,
	variables: Record<string, unknown>,
): Promise<GraphQLResponse<T>> => {
	const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ query, variables }),
		signal: AbortSignal.timeout(30000),
	});

	if (!res.ok) {
		return { data: null, errors: [{ message: `CF API returned ${String(res.status)}` }] };
	}

	const json: unknown = await res.json();
	if (!isGraphQLResponse<T>(json)) {
		return { data: null, errors: [{ message: 'Invalid response' }] };
	}

	return json;
};
