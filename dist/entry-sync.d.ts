import type { DeleteEntriesResult, Entry, EntryFilter, EntryRefs, ImportStats, ImportValidationResult, ModuleFactInput, ReplaceEntriesResult, ReplaceEntriesScope, UpsertFactsResult, UpsertKeyField } from './types.js';
export declare const MAX_BULK_ENTRIES = 50;
export declare function assertBulkEntryLimit(count: number, operation?: string): void;
export declare function resolveEntryRefs(fact: ModuleFactInput, batchModuleName?: string): EntryRefs | undefined;
export declare function buildUpsertKey(entry: {
    kind: string;
    title: string;
    id?: string;
}, upsertBy: UpsertKeyField[]): string;
export declare function scopeToEntryFilter(scope: ReplaceEntriesScope): EntryFilter;
export declare function matchesEntryScope(entry: Entry, scope: ReplaceEntriesScope): boolean;
export declare function upsertFacts(projectId: string, facts: ModuleFactInput[], batchModuleName?: string): Promise<UpsertFactsResult>;
export declare function deleteEntriesByFilter(projectId: string, filter: EntryFilter): Promise<DeleteEntriesResult>;
export declare function replaceEntries(projectId: string, scope: ReplaceEntriesScope, entries: ModuleFactInput[], options?: {
    upsertBy?: UpsertKeyField[];
    deleteOrphans?: boolean;
    batchModuleName?: string;
}): Promise<ReplaceEntriesResult>;
export declare function computeImportStats(entries: Entry[]): ImportStats;
export declare function validateImportEntries(projectId: string, entries: ModuleFactInput[], options?: {
    upsertBy?: UpsertKeyField[];
    checkDuplicates?: boolean;
    checkModuleExists?: boolean;
}): Promise<ImportValidationResult>;
//# sourceMappingURL=entry-sync.d.ts.map