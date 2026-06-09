import type { DatasourceRow } from '../../datasources/-api';
import type { QueryHistoryEntry } from './query-history-store';

import { Badge } from '@graflare/ui/components/badge';
import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { ScrollArea } from '@graflare/ui/components/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@graflare/ui/components/sheet';
import { Tabs, TabsList, TabsTrigger } from '@graflare/ui/components/tabs';
import { ArrowDownNarrowWide, ArrowUpNarrowWide, Check, Copy, MessageSquarePlus, MessageSquareText, Play, Search, Star, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SortOrder = 'newest' | 'oldest';
type Tab = 'history' | 'starred';

const COPIED_RESET_MS = 2000;

const DATASOURCE_TYPE_LABEL: Record<QueryHistoryEntry['datasourceType'], string> = {
  prometheus: 'Prometheus',
  sql: 'SQL',
};

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
];

/** "5 minutes ago" / "just now". `now` is injectable so the relative label is testable. */
const formatRelative = (createdAt: number, now: number): string => {
  const diff = createdAt - now;
  const abs = Math.abs(diff);
  for (const { unit, ms } of RELATIVE_UNITS) {
    if (abs >= ms) return relativeTime.format(Math.round(diff / ms), unit);
  }
  return 'just now';
};

interface QueryHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: QueryHistoryEntry[];
  datasources: readonly DatasourceRow[];
  /** Reference timestamp (epoch ms) for relative "x ago" labels; the parent re-seeds it on open. */
  now: number;
  onRun: (entry: QueryHistoryEntry) => void;
  onToggleStar: (id: string) => void;
  onSetComment: (id: string, comment: string) => void;
  onRemove: (id: string) => void;
}

export const QueryHistoryDrawer = ({ open, onOpenChange, entries, datasources, now, onRun, onToggleStar, onSetComment, onRemove }: QueryHistoryDrawerProps) => {
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [tab, setTab] = useState<Tab>('history');

  const datasourceNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const ds of datasources) map.set(ds.id, ds.name);
    return map;
  }, [datasources]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = entries.filter(e => {
      if (tab === 'starred' && !e.starred) return false;
      if (term === '') return true;
      return e.query.toLowerCase().includes(term) || e.comment.toLowerCase().includes(term);
    });
    // `entries` arrive newest-first; only reverse for oldest-first.
    return sortOrder === 'newest' ? filtered : [...filtered].reverse();
  }, [entries, search, sortOrder, tab]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  const toggleSort = useCallback(() => {
    setSortOrder(o => (o === 'newest' ? 'oldest' : 'newest'));
  }, []);

  const handleTabChange = useCallback((value: string | number | null) => {
    if (value === 'history' || value === 'starred') setTab(value);
  }, []);

  const emptyMessage = tab === 'starred' ? 'No starred queries yet. Star a query to keep it here.' : 'No queries yet. Run a query to start building history.';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-[480px] sm:max-w-[480px]'>
        <SheetHeader>
          <SheetTitle>Query history</SheetTitle>
          <SheetDescription>Re-run, star, and annotate queries you ran in Explore.</SheetDescription>
        </SheetHeader>

        <div className='flex flex-col gap-3 px-6'>
          <div className='flex items-center gap-2'>
            <div className='relative flex-1'>
              <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2' aria-hidden='true' />
              <Input
                type='search'
                value={search}
                onChange={handleSearch}
                placeholder='Search queries and comments'
                aria-label='Search query history'
                className='pl-8'
              />
            </div>
            <Button
              type='button'
              variant='outline'
              size='icon-sm'
              onClick={toggleSort}
              aria-label={sortOrder === 'newest' ? 'Sort oldest first' : 'Sort newest first'}
            >
              {sortOrder === 'newest' ? <ArrowDownNarrowWide /> : <ArrowUpNarrowWide />}
            </Button>
          </div>

          <Tabs value={tab} onValueChange={handleTabChange}>
            <TabsList aria-label='Filter query history'>
              <TabsTrigger value='history'>History</TabsTrigger>
              <TabsTrigger value='starred'>Starred</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <ScrollArea className='mt-3 min-h-0 flex-1'>
          <ul className='flex flex-col gap-2 px-6 pb-6'>
            {visible.length === 0 ? (
              <li className='text-muted-foreground py-8 text-center text-sm'>{emptyMessage}</li>
            ) : (
              visible.map(entry => (
                <QueryHistoryRow
                  key={entry.id}
                  entry={entry}
                  now={now}
                  datasourceName={datasourceNames.get(entry.datasourceId)}
                  onRun={onRun}
                  onToggleStar={onToggleStar}
                  onSetComment={onSetComment}
                  onRemove={onRemove}
                />
              ))
            )}
          </ul>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

interface QueryHistoryRowProps {
  entry: QueryHistoryEntry;
  now: number;
  datasourceName: string | undefined;
  onRun: (entry: QueryHistoryEntry) => void;
  onToggleStar: (id: string) => void;
  onSetComment: (id: string, comment: string) => void;
  onRemove: (id: string) => void;
}

const QueryHistoryRow = ({ entry, now, datasourceName, onRun, onToggleStar, onSetComment, onRemove }: QueryHistoryRowProps) => {
  const [editingComment, setEditingComment] = useState(false);
  const [draftComment, setDraftComment] = useState(entry.comment);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    },
    [],
  );

  // Move focus into the comment field when editing opens (replaces `autoFocus`, which lint bans).
  useEffect(() => {
    if (editingComment) commentInputRef.current?.focus();
  }, [editingComment]);

  const handleRun = useCallback(() => {
    onRun(entry);
  }, [onRun, entry]);

  const handleToggleStar = useCallback(() => {
    onToggleStar(entry.id);
  }, [onToggleStar, entry.id]);

  const handleRemove = useCallback(() => {
    onRemove(entry.id);
  }, [onRemove, entry.id]);

  const handleCopy = useCallback(() => {
    const run = async () => {
      const { clipboard } = navigator;
      if (clipboard === undefined) return;
      try {
        await clipboard.writeText(entry.query);
        setCopied(true);
        if (copyTimer.current !== null) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => {
          setCopied(false);
        }, COPIED_RESET_MS);
      } catch {
        // Clipboard write can reject (permissions); nothing actionable to surface here.
      }
    };
    void run();
  }, [entry.query]);

  const startEditing = useCallback(() => {
    setDraftComment(entry.comment);
    setEditingComment(true);
  }, [entry.comment]);

  const cancelEditing = useCallback(() => {
    setEditingComment(false);
    setDraftComment(entry.comment);
  }, [entry.comment]);

  const handleDraftChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDraftComment(e.target.value);
  }, []);

  const saveComment = useCallback(() => {
    onSetComment(entry.id, draftComment.trim());
    setEditingComment(false);
  }, [onSetComment, entry.id, draftComment]);

  const handleCommentKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveComment();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEditing();
      }
    },
    [saveComment, cancelEditing],
  );

  const typeLabel = DATASOURCE_TYPE_LABEL[entry.datasourceType];

  return (
    <li className='border-border/60 bg-card flex flex-col gap-2 rounded-2xl border p-3'>
      <div className='flex items-start justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <Badge variant='secondary'>{typeLabel}</Badge>
          {datasourceName !== undefined && <span className='text-muted-foreground text-xs'>{datasourceName}</span>}
        </div>
        <time className='text-muted-foreground shrink-0 text-xs' dateTime={new Date(entry.createdAt).toISOString()}>
          {formatRelative(entry.createdAt, now)}
        </time>
      </div>

      <pre className='bg-muted/50 overflow-x-auto rounded-xl px-2.5 py-2 font-mono text-xs whitespace-pre-wrap'>{entry.query}</pre>

      {editingComment ? (
        <div className='flex items-center gap-1.5'>
          <Input
            ref={commentInputRef}
            value={draftComment}
            onChange={handleDraftChange}
            onKeyDown={handleCommentKeyDown}
            placeholder='Add a comment'
            aria-label={`Comment for query ${entry.query}`}
          />
          <Button type='button' variant='ghost' size='icon-sm' onClick={saveComment} aria-label='Save comment'>
            <Check />
          </Button>
          <Button type='button' variant='ghost' size='icon-sm' onClick={cancelEditing} aria-label='Cancel comment'>
            <X />
          </Button>
        </div>
      ) : (
        entry.comment !== '' && <p className='text-muted-foreground text-xs italic'>{entry.comment}</p>
      )}

      <div className='flex items-center gap-1'>
        <Button type='button' variant='ghost' size='xs' onClick={handleRun} aria-label={`Run query ${entry.query}`}>
          <Play />
          Run
        </Button>
        <Button type='button' variant='ghost' size='icon-xs' onClick={handleCopy} aria-label={`Copy query ${entry.query}`}>
          {copied ? <Check className='text-emerald-600 dark:text-emerald-400' /> : <Copy />}
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon-xs'
          onClick={handleToggleStar}
          aria-pressed={entry.starred}
          aria-label={entry.starred ? `Unstar query ${entry.query}` : `Star query ${entry.query}`}
        >
          <Star className={entry.starred ? 'fill-current text-amber-500' : ''} />
        </Button>
        {!editingComment && (
          <Button
            type='button'
            variant='ghost'
            size='icon-xs'
            onClick={startEditing}
            aria-label={entry.comment === '' ? `Add comment to query ${entry.query}` : `Edit comment for query ${entry.query}`}
          >
            {entry.comment === '' ? <MessageSquarePlus /> : <MessageSquareText />}
          </Button>
        )}
        <Button type='button' variant='ghost' size='icon-xs' className='ml-auto' onClick={handleRemove} aria-label={`Delete query ${entry.query}`}>
          <Trash2 />
        </Button>
      </div>

      <span aria-live='polite' className='sr-only'>
        {copied ? 'Query copied to clipboard' : ''}
      </span>
    </li>
  );
};
