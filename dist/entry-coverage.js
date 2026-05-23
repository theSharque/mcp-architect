const API_KINDS = new Set(['http-endpoint', 'grpc-method', 'graphql-field', 'websocket-route']);
const PERSISTENCE_KINDS = new Set(['db-table', 'entity', 'repository', 'migration']);
function entriesForModule(entries, moduleName) {
    return entries.filter((e) => e.refs?.moduleName === moduleName);
}
function hasKind(entries, kinds) {
    return entries.some((e) => kinds.has(e.kind));
}
function fileMatches(file, pattern) {
    const base = file.split('/').pop() ?? file;
    return pattern.test(base) || pattern.test(file);
}
function emptyEntryCoverage() {
    return {
        modulesWithoutEntries: 0,
        entriesUnlinked: 0,
        entriesOrphanModule: 0,
        entriesWithoutModules: 0,
        entriesSliceOrphan: 0,
        modulesTooManyEntries: 0,
        modulesTooFewEntries: 0,
    };
}
export function validateModuleEntryCounts(architecture, entries, options = {}) {
    const issues = [];
    let modulesTooManyEntries = 0;
    let modulesTooFewEntries = 0;
    const moduleEntryMax = options.moduleEntryMax ?? 50;
    const moduleEntryMin = options.moduleEntryMin;
    if (!architecture) {
        return { issues, modulesTooManyEntries, modulesTooFewEntries };
    }
    for (const mod of architecture.modules) {
        const count = entriesForModule(entries, mod.name).length;
        if (count > moduleEntryMax) {
            modulesTooManyEntries += 1;
            issues.push({
                kind: 'module-too-many-entries',
                module: mod.name,
                detail: `Module '${mod.name}' has ${count} entries (max ${moduleEntryMax})—consider splitting the module`,
            });
        }
        if (moduleEntryMin !== undefined &&
            moduleEntryMin > 1 &&
            count > 0 &&
            count < moduleEntryMin) {
            modulesTooFewEntries += 1;
            issues.push({
                kind: 'module-too-few-entries',
                module: mod.name,
                detail: `Module '${mod.name}' has ${count} entries (min ${moduleEntryMin})—consider adding facts or merging modules`,
            });
        }
    }
    return { issues, modulesTooManyEntries, modulesTooFewEntries };
}
export function validateEntryCoverage(architecture, entries, moduleDetailsMap) {
    const issues = [];
    const moduleNames = new Set(architecture?.modules.map((m) => m.name) ?? []);
    const coverage = emptyEntryCoverage();
    if (entries.length > 0 && (!architecture || architecture.modules.length === 0)) {
        coverage.entriesWithoutModules = entries.length;
        issues.push({
            kind: 'entries-without-modules',
            module: '',
            detail: `${entries.length} entries exist but no modules—create structure via set-project-architecture / set-module-details`,
        });
    }
    if (architecture) {
        for (const entry of entries) {
            const ref = entry.refs?.moduleName;
            if (moduleNames.size > 0 && !ref?.trim()) {
                coverage.entriesUnlinked += 1;
                issues.push({
                    kind: 'entry-unlinked',
                    module: entry.title,
                    detail: `Entry '${entry.title}' (${entry.kind}) has no refs.moduleName—link to a module from list-modules`,
                });
            }
            else if (ref && !moduleNames.has(ref)) {
                coverage.entriesOrphanModule += 1;
                issues.push({
                    kind: 'orphan-entry-module',
                    module: ref,
                    detail: `Entry '${entry.title}' references missing module '${ref}'—create module or fix refs.moduleName`,
                });
            }
        }
        for (const mod of architecture.modules) {
            const details = moduleDetailsMap.get(mod.name);
            const files = details?.files ?? [];
            const linked = entriesForModule(entries, mod.name);
            if (files.length > 0 && linked.length === 0) {
                coverage.modulesWithoutEntries += 1;
                issues.push({
                    kind: 'module-no-entries',
                    module: mod.name,
                    detail: `Module '${mod.name}' has ${files.length} files but no entries with refs.moduleName—add facts via set-module-details or set-entry`,
                });
            }
            if (files.some((f) => fileMatches(f, /Controller/i)) && !hasKind(linked, API_KINDS)) {
                issues.push({
                    kind: 'module-missing-api',
                    module: mod.name,
                    detail: `Module '${mod.name}' has controller-like files but no api kinds (http-endpoint, …)—add entries or facts[]`,
                });
            }
            if (files.some((f) => fileMatches(f, /Repository/i) || fileMatches(f, /Entity/i)) &&
                !hasKind(linked, PERSISTENCE_KINDS)) {
                issues.push({
                    kind: 'module-missing-persistence',
                    module: mod.name,
                    detail: `Module '${mod.name}' has persistence-like files but no entity/repository entries`,
                });
            }
        }
    }
    return { issues, coverage };
}
//# sourceMappingURL=entry-coverage.js.map