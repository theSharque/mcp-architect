import type { Entry, EntryCoverageSummary, ModuleDetails, ProjectArchitecture, ValidationIssue } from './types.js';
export declare function validateEntryCoverage(architecture: ProjectArchitecture | null, entries: Entry[], moduleDetailsMap: Map<string, ModuleDetails>): {
    issues: ValidationIssue[];
    coverage: EntryCoverageSummary;
};
//# sourceMappingURL=entry-coverage.d.ts.map