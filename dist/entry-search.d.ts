import type { Entry, SearchEntriesResponse, SliceDefinition } from './types.js';
export declare const SEARCH_DEFAULT_LIMIT = 10;
export declare const SEARCH_MAX_LIMIT = 50;
export declare const SNIPPET_MAX_LEN = 120;
export interface SearchEntriesOptions {
    query: string;
    moduleName?: string;
    kind?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
}
export declare function searchEntries(entries: Entry[], customSlices: SliceDefinition[], options: SearchEntriesOptions): SearchEntriesResponse;
//# sourceMappingURL=entry-search.d.ts.map