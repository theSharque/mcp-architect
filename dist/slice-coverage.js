import { BUILTIN_SLICES, matchesEntryFilter } from './slices.js';
import { listSliceIds, readSlice } from './storage.js';
export function buildSliceFilterRefs(customSlices) {
    const refs = BUILTIN_SLICES.map((slice) => ({
        sliceId: slice.id,
        filter: { kinds: slice.kinds },
    }));
    for (const custom of customSlices) {
        refs.push({
            sliceId: custom.id,
            filter: {
                kinds: custom.filter.kinds,
                tags: custom.filter.tags,
            },
        });
    }
    return refs;
}
export function sliceIdsForEntry(entry, sliceRefs) {
    if (!entry.kind?.trim()) {
        return [];
    }
    return sliceRefs
        .filter((ref) => matchesEntryFilter(entry, ref.filter))
        .map((ref) => ref.sliceId);
}
function entryMatchesAnySlice(entry, sliceRefs) {
    return sliceIdsForEntry(entry, sliceRefs).length > 0;
}
export async function loadCustomSlices(projectId) {
    const ids = await listSliceIds(projectId);
    const slices = [];
    for (const id of ids) {
        const definition = await readSlice(projectId, id);
        if (definition) {
            slices.push(definition);
        }
    }
    return slices;
}
export function validateSliceCoverage(entries, customSlices) {
    const sliceRefs = buildSliceFilterRefs(customSlices);
    const issues = [];
    let entriesSliceOrphan = 0;
    for (const entry of entries) {
        if (entryMatchesAnySlice(entry, sliceRefs)) {
            continue;
        }
        entriesSliceOrphan += 1;
        issues.push({
            kind: 'entry-slice-orphan',
            module: entry.refs?.moduleName ?? entry.title,
            detail: `Entry '${entry.title}' (kind=${entry.kind || 'missing'}) matches no built-in or custom slice—fix kind, add tags, or create a slice`,
        });
    }
    return { issues, entriesSliceOrphan };
}
//# sourceMappingURL=slice-coverage.js.map