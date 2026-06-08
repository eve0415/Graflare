import type { CommandDescriptor, CommandGroupId } from './command-data';

/** A filtered, ranked group ready to render. Only non-empty groups are returned. */
export interface RankedCommandGroup {
  readonly id: CommandGroupId;
  readonly heading: string;
  readonly items: readonly CommandDescriptor[];
}

/** Canonical group order + display headings. Drives both ordering and labels. */
const GROUP_ORDER: readonly { readonly id: CommandGroupId; readonly heading: string }[] = [
  { id: 'pages', heading: 'Pages' },
  { id: 'actions', heading: 'Actions' },
  { id: 'dashboards', heading: 'Dashboards' },
];

// Lower is a better match. Ranks how a query hit a string.
const RANK_PREFIX = 0;
const RANK_WORD_BOUNDARY = 1;
const RANK_SUBSTRING = 2;
const NO_MATCH = Number.POSITIVE_INFINITY;

/** Score one string against the query: prefix < word-boundary < substring < no match. */
const scoreString = (text: string, query: string): number => {
  const haystack = text.toLowerCase();
  const index = haystack.indexOf(query);
  if (index === -1) return NO_MATCH;
  if (index === 0) return RANK_PREFIX;
  // A word boundary is the start of a word: the char before the match is a separator.
  const prev = haystack[index - 1];
  if (prev === ' ' || prev === '-' || prev === '_' || prev === '/') return RANK_WORD_BOUNDARY;
  return RANK_SUBSTRING;
};

/** Best (lowest) score across the command's label and any keywords. */
const scoreCommand = (command: CommandDescriptor, query: string): number => {
  let best = scoreString(command.label, query);
  if (command.keywords) {
    for (const keyword of command.keywords) {
      const score = scoreString(keyword, query);
      if (score < best) best = score;
    }
  }
  return best;
};

/**
 * Filter, group, and rank commands for a query.
 *
 * - An empty or whitespace-only query returns every command in canonical group order,
 *   preserving each command's original order within its group.
 * - Otherwise, commands whose label or keywords match the (case-insensitive) query are
 *   kept and ordered within each group by match quality, with original order as a stable
 *   tie-breaker. Groups with no matches are omitted entirely.
 *
 * Pure: never mutates the input.
 */
export const rankCommands = (query: string, commands: readonly CommandDescriptor[]): readonly RankedCommandGroup[] => {
  const normalized = query.trim().toLowerCase();

  return GROUP_ORDER.flatMap(({ id, heading }) => {
    const inGroup = commands.map((command, index) => ({ command, index })).filter(entry => entry.command.group === id);

    const matched =
      normalized === ''
        ? inGroup.map(entry => ({ ...entry, score: RANK_PREFIX }))
        : inGroup.map(entry => ({ ...entry, score: scoreCommand(entry.command, normalized) })).filter(entry => entry.score !== NO_MATCH);

    if (matched.length === 0) return [];

    const items = matched
      .slice()
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .map(entry => entry.command);

    return [{ id, heading, items }];
  });
};
