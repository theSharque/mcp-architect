/**
 * Type definitions for MCP Architector
 */
export type SliceFormat = 'compact' | 'detail' | 'table';
export interface EntryRefs {
    moduleName?: string;
    files?: string[];
    entryIds?: string[];
}
export interface ModuleFactInput {
    kind: string;
    title: string;
    summary: string;
    payload?: Record<string, unknown>;
    refs?: EntryRefs;
    tags?: string[];
}
export interface UpsertFactsResult {
    entriesCreated: number;
    entriesUpdated: number;
    entryIds: string[];
}
export interface ReplaceEntriesScope {
    kind?: string;
    kinds?: string[];
    moduleName?: string;
    tags?: string[];
}
export type UpsertKeyField = 'kind' | 'title' | 'id';
export interface ReplaceEntriesResult {
    created: number;
    updated: number;
    deleted: number;
    entryIds: string[];
}
export interface DeleteEntriesResult {
    deleted: number;
}
export interface ImportStats {
    byKind: Record<string, number>;
    byModule: Record<string, number>;
    byTag: Record<string, number>;
    total: number;
}
export interface ImportValidationWarning {
    code: string;
    detail: string;
    entryIndex?: number;
}
export interface ImportValidationResult {
    valid: boolean;
    warningCount: number;
    warnings: ImportValidationWarning[];
}
export interface Entry {
    id: string;
    kind: string;
    title: string;
    summary: string;
    payload?: Record<string, unknown>;
    refs?: EntryRefs;
    tags?: string[];
    createdAt: string;
    updatedAt: string;
}
export interface EntryIndexItem {
    id: string;
    kind: string;
    title: string;
    tags?: string[];
    moduleName?: string;
    updatedAt: string;
}
export interface EntryIndex {
    items: EntryIndexItem[];
    migratedScripts?: boolean;
}
export interface SliceFilter {
    kinds?: string[];
    tags?: string[];
}
export interface SliceDefinition {
    id: string;
    title: string;
    description?: string;
    filter: SliceFilter;
    createdAt: string;
    updatedAt: string;
}
export interface BuiltinSliceInfo {
    id: string;
    title: string;
    description: string;
    kinds: string[];
}
export interface DataFlow {
    [moduleName: string]: {
        dependsOn?: string[];
        providesTo?: string[];
        dataTransformation?: string;
    };
}
export interface ProjectSummary {
    projectId: string;
    description: string;
    moduleCount: number;
    updatedAt: string;
    isCurrent: boolean;
}
export interface ProjectArchitecture {
    projectId: string;
    description: string;
    modules: ModuleSummary[];
    dataFlow?: DataFlow;
    createdAt: string;
    updatedAt: string;
}
export interface ModuleSummary {
    id: string;
    name: string;
    description: string;
    inputs?: string;
    outputs?: string;
    createdAt: string;
    updatedAt: string;
}
export interface UsageExample {
    title: string;
    description?: string;
    command?: string;
    input?: string;
    output?: string;
    notes?: string;
}
export interface ModuleDetails {
    moduleId: string;
    name: string;
    description: string;
    inputs: string;
    outputs: string;
    dependencies?: string[];
    files?: string[];
    usageExamples?: UsageExample[];
    notes?: string;
    createdAt: string;
    updatedAt: string;
}
export interface EntryFilter {
    kind?: string;
    kinds?: string[];
    moduleName?: string;
    tags?: string[];
    query?: string;
}
export interface SliceBuildOptions {
    format: SliceFormat;
    limit: number;
    offset?: number;
    query?: string;
    includeModuleContext?: boolean;
}
export interface CompactEntryRow {
    id: string;
    kind: string;
    title: string;
    summary: string;
    refs?: EntryRefs;
    moduleContext?: {
        name: string;
        description: string;
    };
}
export interface SliceResponse {
    sliceId: string;
    title: string;
    format: SliceFormat;
    total: number;
    returned: number;
    offset?: number;
    hasMore?: boolean;
    items: CompactEntryRow[] | Entry[] | Record<string, unknown>[];
}
export interface EntryCoverageSummary {
    modulesWithoutEntries: number;
    entriesUnlinked: number;
    entriesOrphanModule: number;
    entriesWithoutModules: number;
    entriesSliceOrphan: number;
    modulesTooManyEntries: number;
    modulesTooFewEntries: number;
}
export interface ValidationIssue {
    kind: string;
    module: string;
    detail: string;
}
export interface ValidationStats {
    moduleCount: number;
    entryCount: number;
    entryFilesOnDisk: number;
    indexItemCount: number;
}
export interface ProjectValidationResult {
    projectId: string;
    valid: boolean;
    issueCount: number;
    summary: string;
    stats: ValidationStats;
    issuesByKind: Record<string, number>;
    issues: ValidationIssue[];
    coverage?: EntryCoverageSummary;
    checksRun: string[];
}
export interface RebuildResult {
    edgesAdded: number;
    edgesRemoved: number;
    modulesUpdated: number;
}
export type SearchMatchField = 'title' | 'summary' | 'kind' | 'tags';
export interface SearchEntryResult {
    id: string;
    kind: string;
    title: string;
    summary: string;
    tags?: string[];
    refs?: EntryRefs;
    snippet: string;
    matchedIn: SearchMatchField[];
    slices: string[];
    moduleName: string;
}
export interface SearchEntriesResponse {
    summary: string;
    total: number;
    returned: number;
    offset: number;
    hasMore: boolean;
    results: SearchEntryResult[];
}
export interface SliceFilterRef {
    sliceId: string;
    filter: EntryFilter;
}
export interface RefactorScope {
    moduleName?: string;
    kinds?: string[];
    tags?: string[];
}
export type RefactorTextMatch = 'exact' | 'contains';
export type RefactorTextField = 'title' | 'summary' | 'tags' | 'payload' | 'usageExamples';
export interface RefactorPatchMatch {
    id?: string;
    kind?: string;
    title?: string;
}
export interface RefactorPatchSet {
    title?: string;
    summary?: string;
    payload?: Record<string, unknown>;
    refs?: EntryRefs;
    tags?: string[];
}
export type RefactorOperation = {
    type: 'scan';
    file?: string;
    text?: string;
} | {
    type: 'move-file';
    from: string;
    to: string;
} | {
    type: 'replace-path-prefix';
    fromPrefix: string;
    toPrefix: string;
} | {
    type: 'rename-text';
    from: string;
    to: string;
    fields: RefactorTextField[];
    match: RefactorTextMatch;
} | {
    type: 'patch-entry';
    match: RefactorPatchMatch;
    set: RefactorPatchSet;
} | {
    type: 'merge-files';
    from: string[];
    to: string;
} | {
    type: 'remove-file-ref';
    file: string;
    deleteIfEmpty?: boolean;
};
export interface RefactorScanHit {
    target: 'entry' | 'module';
    id?: string;
    moduleName?: string;
    kind?: string;
    field: string;
    value: string;
    snippet: string;
}
export interface RefactorChange {
    action: 'update' | 'delete';
    target: 'entry' | 'module';
    id: string;
    kind?: string;
    moduleName?: string;
    field: string;
    before?: unknown;
    after?: unknown;
}
export interface RefactorStats {
    modules: number;
    entriesUpdated: number;
    entriesDeleted: number;
    hits?: number;
}
export interface RefactorResult {
    dryRun: boolean;
    summary: string;
    stats: RefactorStats;
    hits?: RefactorScanHit[];
    changes: RefactorChange[];
    warnings: string[];
    offset: number;
    hasMore: boolean;
}
export interface RefactorRequest {
    operations: RefactorOperation[];
    scope?: RefactorScope;
    dryRun?: boolean;
    confirm?: boolean;
    limit?: number;
    offset?: number;
}
export interface RefactorDraftState {
    entries: Map<string, Entry>;
    modules: Map<string, ModuleDetails>;
}
//# sourceMappingURL=types.d.ts.map