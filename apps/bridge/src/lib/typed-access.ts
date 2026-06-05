export const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null;

export const getAtPath = (root: unknown, ...path: string[]): unknown => {
	let current: unknown = root;
	for (const key of path) {
		if (!isRecord(current)) return undefined;
		current = current[key];
	}
	return current;
};

export const getNumberAtPath = (root: unknown, ...path: string[]): number | undefined => {
	const val = getAtPath(root, ...path);
	return typeof val === 'number' ? val : undefined;
};

export const getStringAtPath = (root: unknown, ...path: string[]): string | undefined => {
	const val = getAtPath(root, ...path);
	return typeof val === 'string' ? val : undefined;
};
