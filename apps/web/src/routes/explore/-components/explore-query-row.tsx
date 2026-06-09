import type { QueryEditorMode } from '../../-root/query-editor-shell';
import type { PromQLBuilderState } from '@graflare/shared/promql/types';
import type { DatasourceDialect } from '@graflare/shared/schemas/datasource';
import type { SqlBuilderState } from '@graflare/shared/sql/builder';

import { generatePromQL } from '@graflare/shared/promql/generate';
import { buildSql } from '@graflare/shared/sql/builder';
import { Button } from '@graflare/ui/components/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@graflare/ui/components/dialog';
import { XIcon } from 'lucide-react';
import { useCallback, useReducer, useState } from 'react';

import { QueryEditorShell } from '../../-root/query-editor-shell';

import { PromqlBuilder, initialPromqlBuilderState, promqlBuilderReducer } from './promql-builder';
import { QueryCodeEditor } from './query-code-editor';
import { SqlBuilder } from './sql-builder';

const EMPTY_SQL_STATE: SqlBuilderState = {
  table: '',
  columns: [],
  where: [],
  groupBy: [],
  orderBy: [],
  limit: undefined,
  timeColumn: '',
  timeGroupInterval: '',
};

interface QueryRowProps {
  /** Stable identity for this row, owned by the parent (used as React key there). */
  id: string;
  /** The positional label shown to the user (`A`, `B`, `C`, …); presentational only. */
  refId: string;
  datasourceId: string;
  isSql: boolean;
  dialect?: DatasourceDialect | undefined;
  schema?: Record<string, { name: string }[]> | undefined;
  /** Seed for the code editor on first mount (history re-run remounts with a fresh id). */
  initialDraft?: string | undefined;
  /** Seed for the editor mode on first mount. */
  initialMode?: QueryEditorMode | undefined;
  /** Reports this row's effective query (builder→generated, code→draft) on every edit. */
  onChange: (id: string, effectiveQuery: string) => void;
  onRun: () => void;
  /** Present only when removal is allowed (more than one row); the parent enforces the min. */
  onRemove?: ((id: string) => void) | undefined;
}

/**
 * One Explore query row: owns a single query's editor state (mode, code draft, SQL/PromQL
 * builder state) and the builder↔code mode-switch + confirm-reset dialog. The data source,
 * SQL format, time range, and query history all live in the parent pane and are passed in,
 * so every row in a pane targets the same data-source type.
 *
 * The row never holds the parent's notion of "effective query"; it computes the effective
 * query on each edit and reports it up via `onChange(id, …)` — an event path, never an
 * effect, so it satisfies `react-hooks-js/set-state-in-effect`.
 */
export const ExploreQueryRow = ({ id, refId, datasourceId, isSql, dialect, schema, initialDraft, initialMode, onChange, onRun, onRemove }: QueryRowProps) => {
  const [mode, setMode] = useState<QueryEditorMode>(initialMode ?? 'builder');
  const [codeDraft, setCodeDraft] = useState(initialDraft ?? '');
  const [sqlBuilderState, setSqlBuilderState] = useState<SqlBuilderState>(EMPTY_SQL_STATE);
  const [promqlBuilderState, promqlDispatch] = useReducer(promqlBuilderReducer, initialPromqlBuilderState);
  const [confirmReset, setConfirmReset] = useState(false);

  // The effective query for the *builder* mode at this instant. Recomputed in handlers rather
  // than read off a memo because setState is async — after dispatching a builder edit we can't
  // read the next generated string back in the same tick.
  const builderQuery = useCallback((sql: SqlBuilderState, promql: PromQLBuilderState): string => (isSql ? buildSql(sql) : generatePromQL(promql)), [isSql]);

  const generatedQuery = isSql ? buildSql(sqlBuilderState) : generatePromQL(promqlBuilderState);
  const builderPreview = mode === 'builder' ? generatedQuery : '';

  const handleSqlStateChange = useCallback(
    (next: SqlBuilderState) => {
      setSqlBuilderState(next);
      if (mode === 'builder') onChange(id, builderQuery(next, promqlBuilderState));
    },
    [id, mode, onChange, builderQuery, promqlBuilderState],
  );

  const handlePromqlDispatch = useCallback<typeof promqlDispatch>(
    action => {
      const next = promqlBuilderReducer(promqlBuilderState, action);
      promqlDispatch(action);
      if (mode === 'builder') onChange(id, builderQuery(sqlBuilderState, next));
    },
    [id, mode, onChange, builderQuery, promqlBuilderState, sqlBuilderState],
  );

  const handleCodeChange = useCallback(
    (value: string) => {
      setCodeDraft(value);
      if (mode === 'code') onChange(id, value);
    },
    [id, mode, onChange],
  );

  const handleModeChange = useCallback(
    (newMode: QueryEditorMode) => {
      if (newMode === 'code' && mode === 'builder') {
        const seeded = generatedQuery;
        setCodeDraft(seeded);
        setMode('code');
        onChange(id, seeded);
      } else if (newMode === 'builder' && mode === 'code') {
        if (codeDraft !== generatedQuery && codeDraft !== '') {
          setConfirmReset(true);
        } else {
          setMode('builder');
          onChange(id, generatedQuery);
        }
      }
    },
    [id, mode, codeDraft, generatedQuery, onChange],
  );

  const confirmModeReset = useCallback(() => {
    setConfirmReset(false);
    setMode('builder');
    onChange(id, generatedQuery);
  }, [id, generatedQuery, onChange]);

  const handleRemove = useCallback(() => {
    onRemove?.(id);
  }, [onRemove, id]);

  return (
    <fieldset className='border-border/60 bg-card/40 m-0 flex min-w-0 gap-3 rounded-lg border p-3 pl-2.5' aria-label={`Query ${refId}`}>
      {/* refId rail — a narrow left gutter so stacked rows read A / B / C at a glance. */}
      <div className='border-border/60 flex shrink-0 flex-col items-center gap-2 border-r pr-2.5'>
        <span
          className='bg-muted text-foreground flex h-7 w-7 items-center justify-center rounded-md font-mono text-sm font-semibold tabular-nums'
          aria-hidden='true'
        >
          {refId}
        </span>
        {onRemove !== undefined && (
          <Button
            variant='ghost'
            size='icon-sm'
            className='text-muted-foreground hover:text-destructive'
            onClick={handleRemove}
            aria-label={`Remove query ${refId}`}
          >
            <XIcon />
          </Button>
        )}
      </div>

      <div className='min-w-0 flex-1'>
        <QueryEditorShell mode={mode} onModeChange={handleModeChange} preview={builderPreview === '' ? undefined : builderPreview}>
          {mode === 'builder' ? (
            isSql ? (
              <SqlBuilder datasourceId={datasourceId} state={sqlBuilderState} onStateChange={handleSqlStateChange} />
            ) : (
              <PromqlBuilder datasourceId={datasourceId} state={promqlBuilderState} dispatch={handlePromqlDispatch} />
            )
          ) : (
            <QueryCodeEditor
              datasourceType={isSql ? 'sql' : 'prometheus'}
              {...(dialect === undefined ? {} : { dialect })}
              {...(schema === undefined ? {} : { schema })}
              value={codeDraft}
              onChange={handleCodeChange}
              onRun={onRun}
              placeholder={isSql ? 'Enter a SQL query...' : 'Enter a PromQL query...'}
            />
          )}
        </QueryEditorShell>
      </div>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogTitle>Switch to Builder?</DialogTitle>
          <DialogDescription>Your Code mode edits will be lost. The builder will reset to its current state.</DialogDescription>
          <DialogFooter>
            <DialogClose>Cancel</DialogClose>
            <Button onClick={confirmModeReset}>Switch to Builder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </fieldset>
  );
};
