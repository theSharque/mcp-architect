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
    refs?: Omit<EntryRefs, 'moduleName'>;
    tags?: string[];
}
export interface UpsertFactsResult {
    entriesCreated: number;
    entriesUpdated: number;
    entryIds: string[];
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
    kinds?: string[];
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
//# sourceMappingURL=types.d.ts.map