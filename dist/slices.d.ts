import type { BuiltinSliceInfo, Entry, EntryFilter, ProjectArchitecture, SliceBuildOptions, SliceDefinition, SliceResponse } from './types.js';
export declare const BUILTIN_SLICES: BuiltinSliceInfo[];
export declare function getBuiltinSlice(sliceId: string): BuiltinSliceInfo | undefined;
export declare function resolveSliceFilter(sliceId: string, customSlice: SliceDefinition | null): EntryFilter | null;
export declare function matchesEntryFilter(entry: Entry, filter: EntryFilter): boolean;
export declare function clampLimit(limit?: number): number;
export declare function buildSliceResponse(sliceId: string, sliceTitle: string, entries: Entry[], options: SliceBuildOptions, architecture: ProjectArchitecture | null): SliceResponse;
export declare function countEntriesForKinds(indexItems: {
    kind: string;
}[], kinds: string[]): number;
//# sourceMappingURL=slices.d.ts.map