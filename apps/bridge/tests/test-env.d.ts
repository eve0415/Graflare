import type { D1Migration } from 'cloudflare:test';

declare global {
	namespace Cloudflare {
		interface Env {
			TEST_MIGRATIONS: D1Migration[];
			BRIDGE_AUTH_TOKEN: string;
			CF_API_TOKEN: string;
			CF_ACCOUNT_ID: string;
			BRIDGE_DEBUG: string;
		}
	}
}
