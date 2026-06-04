import type { DatasourceDialect } from '@graflare/shared/schemas/datasource';

export interface IntrospectionQuery {
	sql: string;
	params: string[];
}

export const listTablesQuery = (dialect: DatasourceDialect): IntrospectionQuery => {
	if (dialect === 'postgres') {
		return {
			sql: "SELECT table_name AS name, table_schema AS schema FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_type = 'BASE TABLE' ORDER BY table_schema, table_name",
			params: [],
		};
	}
	return {
		sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
		params: [],
	};
};

export const describeTableQuery = (dialect: DatasourceDialect, tableName: string, schema?: string): IntrospectionQuery => {
	if (dialect === 'postgres') {
		return {
			sql: 'SELECT column_name AS name, data_type AS type, CASE WHEN is_nullable = \'YES\' THEN 1 ELSE 0 END AS nullable FROM information_schema.columns WHERE table_name = ? AND table_schema = ? ORDER BY ordinal_position',
			params: [tableName, schema ?? 'public'],
		};
	}
	return {
		sql: 'SELECT name, type, CASE WHEN "notnull" = 0 THEN 1 ELSE 0 END AS nullable FROM pragma_table_info(?)',
		params: [tableName],
	};
};
