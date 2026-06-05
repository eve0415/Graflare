const FNV_PRIME = 16777619;
const FNV_OFFSET = 0x81_1C_9D_C5;
const UINT32 = 4294967296;

const toUnsigned32 = (n: number): number => (n < 0 ? n + UINT32 : n);

export const dimsHash = (dims: Record<string, string>): string => {
	const keys = Object.keys(dims).sort();
	if (keys.length === 0) return '00000000';

	const str = keys.map((k) => `${k}=${dims[k] ?? ''}`).join('\0');
	let hash = FNV_OFFSET;
	for (let i = 0; i < str.length; i++) {
		const code = str.codePointAt(i) ?? 0;
		hash = toUnsigned32(Math.imul(hash + code, FNV_PRIME));
	}
	return hash.toString(16).padStart(8, '0');
};
