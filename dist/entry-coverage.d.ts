import type { Entry, EntryCoverageSummary, ModuleDetails, ProjectArchitecture, ValidationIssue } from './types.js';
export interface ModuleEntryCountOptions {
    moduleEntryMax?: number;
    moduleEntryMin?: number;
}
export declare function validateModuleEntryCounts(architecture: ProjectArchitecture | null, entries: Entry[], options?: ModuleEntryCountOptions): {
    issues: ValidationIssue[];
    modulesTooManyEntries: number;
    modulesTooFewEntries: number;
};
export declare function validateEntryCoverage(architecture: ProjectArchitecture | null, entries: Entry[], moduleDetailsMap: Map<string, ModuleDetails>): {
    issues: ValidationIssue[];
    coverage: EntryCoverageSummary;
};
//# sourceMappingURL=entry-coverage.d.ts.map