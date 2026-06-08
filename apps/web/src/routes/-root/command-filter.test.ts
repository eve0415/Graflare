import type { CommandDescriptor } from './command-data';

import { describe, expect, it } from 'vitest';

import { rankCommands } from './command-filter';

const noop = () => {};

const make = (id: string, group: CommandDescriptor['group'], label: string, keywords?: readonly string[]): CommandDescriptor =>
  // `exactOptionalPropertyTypes` forbids an explicit `keywords: undefined`, so only attach it when provided.
  keywords === undefined ? { id, group, label, run: noop } : { id, group, label, keywords, run: noop };

const commands: readonly CommandDescriptor[] = [
  make('p-dash', 'pages', 'Dashboards'),
  make('p-explore', 'pages', 'Explore'),
  make('p-alert', 'pages', 'Alerting'),
  make('a-new-dash', 'actions', 'New dashboard', ['create', 'add']),
  make('a-new-ds', 'actions', 'New data source', ['create', 'datasource']),
  make('d-cpu', 'dashboards', 'CPU Overview'),
  make('d-mem', 'dashboards', 'Memory Usage'),
];

describe('rankCommands', () => {
  it('returns every group in canonical order with all items when the query is empty', () => {
    const groups = rankCommands('', commands);
    expect(groups.map(g => g.id)).toEqual(['pages', 'actions', 'dashboards']);
    expect(groups[0]?.items.map(c => c.id)).toEqual(['p-dash', 'p-explore', 'p-alert']);
    expect(groups[1]?.items.map(c => c.id)).toEqual(['a-new-dash', 'a-new-ds']);
    expect(groups[2]?.items.map(c => c.id)).toEqual(['d-cpu', 'd-mem']);
  });

  it('treats a whitespace-only query as empty', () => {
    const groups = rankCommands('   ', commands);
    expect(groups.flatMap(g => g.items)).toHaveLength(commands.length);
  });

  it('filters case-insensitively by label substring', () => {
    const groups = rankCommands('dash', commands);
    const ids = groups.flatMap(g => g.items.map(c => c.id));
    // "Dashboards" page and "New dashboard" action match; nothing else.
    expect(ids).toContain('p-dash');
    expect(ids).toContain('a-new-dash');
    expect(ids).not.toContain('p-explore');
    expect(ids).not.toContain('d-cpu');
  });

  it('drops groups that have no matching items', () => {
    const groups = rankCommands('cpu', commands);
    expect(groups.map(g => g.id)).toEqual(['dashboards']);
    expect(groups[0]?.items.map(c => c.id)).toEqual(['d-cpu']);
  });

  it('matches on keywords even when the label does not contain the query', () => {
    const groups = rankCommands('create', commands);
    const ids = groups.flatMap(g => g.items.map(c => c.id));
    expect(ids).toEqual(['a-new-dash', 'a-new-ds']);
  });

  it('ranks prefix matches above mid-word substring matches within a group', () => {
    const items: readonly CommandDescriptor[] = [make('mid', 'dashboards', 'My App'), make('pre', 'dashboards', 'Application Metrics')];
    // Query "app": "Application" is a prefix match, "My App" is a substring match.
    const groups = rankCommands('app', items);
    expect(groups[0]?.items.map(c => c.id)).toEqual(['pre', 'mid']);
  });

  it('ranks word-boundary matches above mid-word matches', () => {
    const items: readonly CommandDescriptor[] = [make('mid', 'dashboards', 'Snapshot'), make('word', 'dashboards', 'My Shot')];
    // Query "shot": "My Shot" matches at a word boundary, "Snapshot" mid-word.
    const groups = rankCommands('shot', items);
    expect(groups[0]?.items.map(c => c.id)).toEqual(['word', 'mid']);
  });

  it('keeps original order as a stable tie-breaker for equal-rank matches', () => {
    const items: readonly CommandDescriptor[] = [make('first', 'dashboards', 'Alpha node'), make('second', 'dashboards', 'Beta node')];
    const groups = rankCommands('node', items);
    expect(groups[0]?.items.map(c => c.id)).toEqual(['first', 'second']);
  });

  it('returns no groups when nothing matches', () => {
    expect(rankCommands('zzzzz', commands)).toEqual([]);
  });

  it('does not mutate the input array order', () => {
    const snapshot = commands.map(c => c.id);
    rankCommands('app', commands);
    expect(commands.map(c => c.id)).toEqual(snapshot);
  });
});
