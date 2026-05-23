import type { Entry, SliceDefinition, SliceFilterRef, ValidationIssue } from './types.js';
export declare function buildSliceFilterRefs(customSlices: SliceDefinition[]): SliceFilterRef[];
export declare function sliceIdsForEntry(entry: Entry, sliceRefs: SliceFilterRef[]): string[];
export declare function loadCustomSlices(projectId: string): Promise<SliceDefinition[]>;
export declare function validateSliceCoverage(entries: Entry[], customSlices: SliceDefinition[]): {
    issues: ValidationIssue[];
    entriesSliceOrphan: number;
};
//# sourceMappingURL=slice-coverage.d.ts.map