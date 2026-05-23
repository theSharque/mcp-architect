import { clampOffset } from './slices.js';
import { buildSliceFilterRefs, sliceIdsForEntry } from './slice-coverage.js';
import type {
  Entry,
  SearchEntriesResponse,
  SearchEntryResult,
  SearchMatchField,
  SliceDefinition,
} from './types.js';

export const SEARCH_DEFAULT_LIMIT = 10;
export const SEARCH_MAX_LIMIT = 50;
export const SNIPPET_MAX_LEN = 120;

export interface SearchEntriesOptions {
  query: string;
  moduleName?: string;
  kind?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

function clampSearchLimit(limit?: number): number {
  if (limit === undefined || limit < 1) {
    return SEARCH_DEFAULT_LIMIT;
  }
  return Math.min(limit, SEARCH_MAX_LIMIT);
}

function matchesTags(entry: Entry, tags?: string[]): boolean {
  if (!tags?.length) {
    return true;
  }
  const entryTags = entry.tags ?? [];
  return tags.some((tag) => entryTags.includes(tag));
}

function matchesKind(entry: Entry, kind?: string): boolean {
  if (!kind?.trim()) {
    return true;
  }
  return entry.kind === kind;
}

function matchesModule(entry: Entry, moduleName?: string): boolean {
  if (!moduleName?.trim()) {
    return true;
  }
  return entry.refs?.moduleName === moduleName;
}

function findMatchedIn(entry: Entry, query: string): SearchMatchField[] {
  const matched: SearchMatchField[] = [];
  if (entry.title.toLowerCase().includes(query)) {
    matched.push('title');
  }
  if (entry.summary.toLowerCase().includes(query)) {
    matched.push('summary');
  }
  if (entry.kind.toLowerCase().includes(query)) {
    matched.push('kind');
  }
  if ((entry.tags ?? []).some((tag) => tag.toLowerCase().includes(query))) {
    matched.push('tags');
  }
  return matched;
}

function excerptAroundMatch(text: string, query: string, maxLen: number): string {
  const lower = text.toLowerCase();
  const index = lower.indexOf(query);
  if (index < 0) {
    return truncateText(text, maxLen);
  }

  const half = Math.floor((maxLen - query.length - 3) / 2);
  const start = Math.max(0, index - half);
  const end = Math.min(text.length, index + query.length + half);
  let excerpt = text.slice(start, end);
  if (start > 0) {
    excerpt = `…${excerpt}`;
  }
  if (end < text.length) {
    excerpt = `${excerpt}…`;
  }
  return excerpt;
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen - 1)}…`;
}

function buildSnippet(entry: Entry, query: string, matchedIn: SearchMatchField[]): string {
  if (matchedIn.includes('summary')) {
    return excerptAroundMatch(entry.summary, query, SNIPPET_MAX_LEN);
  }
  return truncateText(entry.summary, SNIPPET_MAX_LEN);
}

function sortRank(entry: Entry, query: string): number {
  if (entry.title.toLowerCase().includes(query)) {
    return 0;
  }
  if (entry.summary.toLowerCase().includes(query)) {
    return 1;
  }
  return 2;
}

function toSearchResult(
  entry: Entry,
  query: string,
  matchedIn: SearchMatchField[],
  sliceRefs: ReturnType<typeof buildSliceFilterRefs>
): SearchEntryResult {
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    summary: entry.summary,
    tags: entry.tags,
    refs: entry.refs,
    snippet: buildSnippet(entry, query, matchedIn),
    matchedIn,
    slices: sliceIdsForEntry(entry, sliceRefs),
    moduleName: entry.refs?.moduleName ?? '',
  };
}

function buildResponseSummary(query: string, results: SearchEntryResult[], total: number): string {
  const sliceSet = new Set<string>();
  for (const result of results) {
    for (const sliceId of result.slices) {
      sliceSet.add(sliceId);
    }
  }
  const sliceList = [...sliceSet].slice(0, 5);
  const slicePart = sliceList.length ? ` (slices: ${sliceList.join(', ')})` : '';
  return `${total} match${total === 1 ? '' : 'es'} for "${query}"${slicePart}`;
}

export function searchEntries(
  entries: Entry[],
  customSlices: SliceDefinition[],
  options: SearchEntriesOptions
): SearchEntriesResponse {
  const query = options.query.trim().toLowerCase();
  const limit = clampSearchLimit(options.limit);
  const offset = clampOffset(options.offset);
  const sliceRefs = buildSliceFilterRefs(customSlices);

  const matched = entries
    .filter(
      (entry) =>
        matchesKind(entry, options.kind) &&
        matchesTags(entry, options.tags) &&
        matchesModule(entry, options.moduleName)
    )
    .map((entry) => ({
      entry,
      matchedIn: findMatchedIn(entry, query),
    }))
    .filter(({ matchedIn }) => matchedIn.length > 0)
    .sort((a, b) => {
      const rankDiff = sortRank(a.entry, query) - sortRank(b.entry, query);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return new Date(b.entry.updatedAt).getTime() - new Date(a.entry.updatedAt).getTime();
    });

  const total = matched.length;
  const page = matched.slice(offset, offset + limit);
  const results = page.map(({ entry, matchedIn }) =>
    toSearchResult(entry, query, matchedIn, sliceRefs)
  );

  return {
    summary: buildResponseSummary(options.query.trim(), results, total),
    total,
    returned: results.length,
    offset,
    hasMore: offset + results.length < total,
    results,
  };
}
