export interface BridgeEnv {
	DB: D1Database;
	CF_API_TOKEN: string;
	CF_ACCOUNT_ID: string;
	CF_ZONE_IDS: string;
	BRIDGE_AUTH_TOKEN: string;
	BRIDGE_DEBUG?: string;
}
