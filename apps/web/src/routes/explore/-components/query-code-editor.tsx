import { autocompletion } from '@codemirror/autocomplete';
import { PostgreSQL, SQLite, sql } from '@codemirror/lang-sql';
import type { SQLNamespace } from '@codemirror/lang-sql';
import type { Extension } from '@codemirror/state';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view';
import type { PrometheusClient } from '@prometheus-io/codemirror-promql';
import { PromQLExtension } from '@prometheus-io/codemirror-promql';
import { useEffect, useRef } from 'react';

import type { DatasourceDialect, DatasourceType } from '@graflare/shared/schemas/datasource';

interface QueryCodeEditorProps {
	datasourceType: DatasourceType;
	dialect?: DatasourceDialect;
	schema?: Record<string, { name: string }[]>;
	promqlClient?: PrometheusClient;
	value: string;
	onChange: (value: string) => void;
	onRun: () => void;
	placeholder?: string;
}

const theme = EditorView.theme({
	'&': {
		fontSize: '14px',
		fontFamily: 'Geist Mono, monospace',
	},
	'.cm-content': {
		padding: '8px 12px',
		minHeight: '36px',
	},
	'&.cm-focused': {
		outline: 'none',
	},
	'.cm-gutters': {
		display: 'none',
	},
});

const buildSqlSchema = (schema: Record<string, { name: string }[]> | undefined): SQLNamespace => {
	if (schema === undefined) return {};
	const result: Record<string, string[]> = {};
	for (const [table, cols] of Object.entries(schema)) {
		result[table] = cols.map((c) => c.name);
	}
	return result;
};

const buildSqlExtension = (dialect: DatasourceDialect | undefined, schema: Record<string, { name: string }[]> | undefined): Extension => {
	const dialectObj = dialect === 'postgres' ? PostgreSQL : SQLite;
	return sql({ dialect: dialectObj, schema: buildSqlSchema(schema), upperCaseKeywords: true });
};

const buildPromqlExtension = (client: PrometheusClient | undefined): Extension => {
	const ext = new PromQLExtension();
	if (client !== undefined) {
		ext.setComplete({ remote: client });
	}
	return ext.asExtension();
};

export const QueryCodeEditor = ({
	datasourceType,
	dialect,
	schema,
	promqlClient,
	value,
	onChange,
	onRun,
	placeholder,
}: QueryCodeEditorProps) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const langCompartment = useRef(new Compartment());
	const onChangeRef = useRef(onChange);
	const onRunRef = useRef(onRun);

	useEffect(() => {
		onChangeRef.current = onChange;
		onRunRef.current = onRun;
	});

	useEffect(() => {
		const container = containerRef.current;
		if (container === null) return;

		const runKeymap = keymap.of([
			{
				key: 'Mod-Enter',
				run: () => {
					onRunRef.current();
					return true;
				},
			},
		]);

		const updateListener = EditorView.updateListener.of((update) => {
			if (update.docChanged) {
				onChangeRef.current(update.state.doc.toString());
			}
		});

		const extensions = [
			theme,
			runKeymap,
			updateListener,
			autocompletion(),
			langCompartment.current.of([]),
			EditorView.lineWrapping,
		];

		if (placeholder !== undefined) {
			extensions.push(placeholderExt(placeholder));
		}

		const state = EditorState.create({ doc: '', extensions });
		const view = new EditorView({ state, parent: container });
		viewRef.current = view;

		return () => {
			view.destroy();
			viewRef.current = null;
		};
	}, [datasourceType, placeholder]);

	useEffect(() => {
		const view = viewRef.current;
		if (view === null) return;

		const langExtension =
			datasourceType === 'sql'
				? buildSqlExtension(dialect, schema)
				: buildPromqlExtension(promqlClient);

		view.dispatch({ effects: langCompartment.current.reconfigure(langExtension) });
	}, [datasourceType, dialect, schema, promqlClient]);

	useEffect(() => {
		const view = viewRef.current;
		if (view === null) return;
		const currentDoc = view.state.doc.toString();
		if (currentDoc !== value) {
			view.dispatch({
				changes: { from: 0, to: currentDoc.length, insert: value },
			});
		}
	}, [value]);

	return (
		<div
			ref={containerRef}
			className='border-border bg-background overflow-hidden rounded-md border'
			aria-label={datasourceType === 'sql' ? 'SQL query editor' : 'PromQL query editor'}
		/>
	);
};
