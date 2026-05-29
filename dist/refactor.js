import { deleteEntry, loadEntries, readArchitecture, readModule, writeEntry, writeModule, } from './storage.js';
import { matchesEntryScope } from './entry-sync.js';
export const MAX_REFACTOR_OPERATIONS = 10;
export const DEFAULT_REFACTOR_CHANGE_LIMIT = 15;
export const MAX_REFACTOR_CHANGE_LIMIT = 50;
export const MAX_REFACTOR_WARNINGS = 5;
function cloneEntry(entry) {
    return structuredClone(entry);
}
function cloneModule(module) {
    return structuredClone(module);
}
function scopeToReplaceScope(scope) {
    return {
        moduleName: scope?.moduleName,
        kinds: scope?.kinds,
        tags: scope?.tags,
    };
}
function entryInScope(entry, scope) {
    if (!scope) {
        return true;
    }
    return matchesEntryScope(entry, scopeToReplaceScope(scope));
}
function moduleInScope(module, scope) {
    if (!scope?.moduleName) {
        return true;
    }
    return module.name === scope.moduleName;
}
function snippet(value, max = 80) {
    if (value.length <= max) {
        return value;
    }
    return `${value.slice(0, max - 3)}...`;
}
function replaceString(value, from, to, match) {
    if (match === 'exact') {
        return value === from ? to : null;
    }
    if (!value.includes(from)) {
        return null;
    }
    return value.split(from).join(to);
}
function replaceInPayload(payload, from, to, match) {
    if (!payload) {
        return { next: payload, changed: false };
    }
    let changed = false;
    function walk(value) {
        if (typeof value === 'string') {
            const replaced = replaceString(value, from, to, match);
            if (replaced !== null) {
                changed = true;
                return replaced;
            }
            return value;
        }
        if (Array.isArray(value)) {
            return value.map(walk);
        }
        if (value && typeof value === 'object') {
            const out = {};
            for (const [key, nested] of Object.entries(value)) {
                out[key] = walk(nested);
            }
            return out;
        }
        return value;
    }
    const next = walk(payload);
    return { next: changed ? next : payload, changed };
}
function replaceInUsageExamples(examples, from, to, match) {
    if (!examples?.length) {
        return { next: examples, changed: false };
    }
    let changed = false;
    const next = examples.map((example) => {
        const updated = { ...example };
        for (const key of ['title', 'description', 'command', 'input', 'output', 'notes']) {
            const value = example[key];
            if (typeof value !== 'string') {
                continue;
            }
            const replaced = replaceString(value, from, to, match);
            if (replaced !== null) {
                updated[key] = replaced;
                changed = true;
            }
        }
        return updated;
    });
    return { next: changed ? next : examples, changed };
}
function replaceFilePath(path, from, to, exact) {
    if (exact) {
        return path === from ? to : null;
    }
    if (!path.startsWith(from)) {
        return null;
    }
    return `${to}${path.slice(from.length)}`;
}
function replaceFilesList(files, replacer) {
    if (!files?.length) {
        return { next: files, changed: false };
    }
    let changed = false;
    const next = [];
    for (const file of files) {
        const replaced = replacer(file);
        if (replaced !== null) {
            changed = true;
            if (!next.includes(replaced)) {
                next.push(replaced);
            }
            continue;
        }
        if (!next.includes(file)) {
            next.push(file);
        }
    }
    return { next: changed ? next : files, changed };
}
function mergeFilesList(files, from, to) {
    if (!files?.length) {
        return { next: files, changed: false };
    }
    const fromSet = new Set(from);
    let changed = false;
    const next = [];
    for (const file of files) {
        if (fromSet.has(file)) {
            changed = true;
            if (!next.includes(to)) {
                next.push(to);
            }
            continue;
        }
        if (!next.includes(file)) {
            next.push(file);
        }
    }
    return { next: changed ? next : files, changed };
}
function removeFileFromList(files, file) {
    if (!files?.length) {
        return { next: files, changed: false };
    }
    const next = files.filter((item) => item !== file);
    return { next, changed: next.length !== files.length };
}
function shouldDeleteOrphan(entry) {
    if (entry.refs?.entryIds?.length) {
        return false;
    }
    return Array.isArray(entry.refs?.files) && entry.refs.files.length === 0;
}
function findEntryByMatch(state, match, scope) {
    if (match.id) {
        const entry = state.entries.get(match.id);
        if (entry && entryInScope(entry, scope)) {
            return entry;
        }
        return undefined;
    }
    if (!match.kind || !match.title) {
        return undefined;
    }
    for (const entry of state.entries.values()) {
        if (entry.kind === match.kind &&
            entry.title === match.title &&
            entryInScope(entry, scope)) {
            return entry;
        }
    }
    return undefined;
}
function hasTitleCollision(state, entryId, kind, title) {
    for (const entry of state.entries.values()) {
        if (entry.id !== entryId && entry.kind === kind && entry.title === title) {
            return true;
        }
    }
    return false;
}
function recordEntryUpdate(changes, entry, field, before, after) {
    changes.push({
        action: 'update',
        target: 'entry',
        id: entry.id,
        kind: entry.kind,
        moduleName: entry.refs?.moduleName,
        field,
        before,
        after,
    });
}
function recordModuleUpdate(changes, module, field, before, after) {
    changes.push({
        action: 'update',
        target: 'module',
        id: module.moduleId,
        moduleName: module.name,
        field,
        before,
        after,
    });
}
function recordEntryDelete(changes, entry) {
    changes.push({
        action: 'delete',
        target: 'entry',
        id: entry.id,
        kind: entry.kind,
        moduleName: entry.refs?.moduleName,
        field: 'entry',
        before: entry.title,
    });
}
export function createDraftState(entries, modules) {
    return {
        entries: new Map(entries.map((entry) => [entry.id, cloneEntry(entry)])),
        modules: new Map(modules.map((module) => [module.moduleId, cloneModule(module)])),
    };
}
export function assertRefactorOperationLimit(count) {
    if (count > MAX_REFACTOR_OPERATIONS) {
        throw new Error(`Too many refactor operations: max ${MAX_REFACTOR_OPERATIONS} per call`);
    }
}
export function clampRefactorLimit(limit) {
    if (limit === undefined || limit < 1) {
        return DEFAULT_REFACTOR_CHANGE_LIMIT;
    }
    return Math.min(limit, MAX_REFACTOR_CHANGE_LIMIT);
}
export function clampRefactorOffset(offset) {
    if (offset === undefined || offset < 0) {
        return 0;
    }
    return Math.floor(offset);
}
function pushWarning(warnings, message) {
    if (warnings.length < MAX_REFACTOR_WARNINGS) {
        warnings.push(message);
    }
}
function scanState(state, operations, scope) {
    const hits = [];
    const scanOps = operations.filter((op) => op.type === 'scan');
    for (const op of scanOps) {
        if (op.type !== 'scan') {
            continue;
        }
        for (const entry of state.entries.values()) {
            if (!entryInScope(entry, scope)) {
                continue;
            }
            if (op.file && entry.refs?.files) {
                for (const file of entry.refs.files) {
                    if (file === op.file || file.includes(op.file)) {
                        hits.push({
                            target: 'entry',
                            id: entry.id,
                            moduleName: entry.refs?.moduleName,
                            kind: entry.kind,
                            field: 'refs.files',
                            value: file,
                            snippet: snippet(`${entry.kind}: ${entry.title} → ${file}`),
                        });
                    }
                }
            }
            if (op.text) {
                for (const field of ['title', 'summary']) {
                    const value = entry[field];
                    if (value.includes(op.text)) {
                        hits.push({
                            target: 'entry',
                            id: entry.id,
                            moduleName: entry.refs?.moduleName,
                            kind: entry.kind,
                            field,
                            value,
                            snippet: snippet(value),
                        });
                    }
                }
                if (entry.tags?.some((tag) => tag.includes(op.text))) {
                    hits.push({
                        target: 'entry',
                        id: entry.id,
                        moduleName: entry.refs?.moduleName,
                        kind: entry.kind,
                        field: 'tags',
                        value: entry.tags.join(', '),
                        snippet: snippet(`${entry.kind}: ${entry.title}`),
                    });
                }
            }
        }
        for (const module of state.modules.values()) {
            if (!moduleInScope(module, scope)) {
                continue;
            }
            if (op.file && module.files) {
                for (const file of module.files) {
                    if (file === op.file || file.includes(op.file)) {
                        hits.push({
                            target: 'module',
                            id: module.moduleId,
                            moduleName: module.name,
                            field: 'files',
                            value: file,
                            snippet: snippet(`${module.name} → ${file}`),
                        });
                    }
                }
            }
            if (op.text && module.usageExamples) {
                for (const example of module.usageExamples) {
                    for (const key of ['title', 'description', 'command', 'input', 'output', 'notes']) {
                        const value = example[key];
                        if (typeof value === 'string' && value.includes(op.text)) {
                            hits.push({
                                target: 'module',
                                id: module.moduleId,
                                moduleName: module.name,
                                field: `usageExamples.${key}`,
                                value,
                                snippet: snippet(value),
                            });
                        }
                    }
                }
            }
        }
    }
    return hits;
}
function applyMoveFile(state, from, to, scope, changes) {
    for (const entry of state.entries.values()) {
        if (!entryInScope(entry, scope)) {
            continue;
        }
        const before = entry.refs?.files ? [...entry.refs.files] : undefined;
        const { next, changed } = replaceFilesList(entry.refs?.files, (file) => replaceFilePath(file, from, to, true));
        if (!changed || !next) {
            continue;
        }
        entry.refs = { ...entry.refs, files: next };
        recordEntryUpdate(changes, entry, 'refs.files', before, next);
    }
    for (const module of state.modules.values()) {
        if (!moduleInScope(module, scope)) {
            continue;
        }
        const before = module.files ? [...module.files] : undefined;
        const { next, changed } = replaceFilesList(module.files, (file) => replaceFilePath(file, from, to, true));
        if (!changed || !next) {
            continue;
        }
        module.files = next;
        recordModuleUpdate(changes, module, 'files', before, next);
    }
}
function applyReplacePathPrefix(state, fromPrefix, toPrefix, scope, changes) {
    for (const entry of state.entries.values()) {
        if (!entryInScope(entry, scope)) {
            continue;
        }
        const before = entry.refs?.files ? [...entry.refs.files] : undefined;
        const { next, changed } = replaceFilesList(entry.refs?.files, (file) => replaceFilePath(file, fromPrefix, toPrefix, false));
        if (!changed || !next) {
            continue;
        }
        entry.refs = { ...entry.refs, files: next };
        recordEntryUpdate(changes, entry, 'refs.files', before, next);
    }
    for (const module of state.modules.values()) {
        if (!moduleInScope(module, scope)) {
            continue;
        }
        const before = module.files ? [...module.files] : undefined;
        const { next, changed } = replaceFilesList(module.files, (file) => replaceFilePath(file, fromPrefix, toPrefix, false));
        if (!changed || !next) {
            continue;
        }
        module.files = next;
        recordModuleUpdate(changes, module, 'files', before, next);
    }
}
function applyRenameTextToEntry(state, entry, from, to, fields, match, changes, warnings) {
    for (const field of fields) {
        if (field === 'title') {
            const replaced = replaceString(entry.title, from, to, match);
            if (replaced === null) {
                continue;
            }
            if (hasTitleCollision(state, entry.id, entry.kind, replaced)) {
                pushWarning(warnings, `Skipped title change for entry ${entry.id}: '${entry.kind}' / '${replaced}' already exists`);
                continue;
            }
            const before = entry.title;
            entry.title = replaced;
            recordEntryUpdate(changes, entry, 'title', before, replaced);
            continue;
        }
        if (field === 'summary') {
            const replaced = replaceString(entry.summary, from, to, match);
            if (replaced === null) {
                continue;
            }
            const before = entry.summary;
            entry.summary = replaced;
            recordEntryUpdate(changes, entry, 'summary', before, replaced);
            continue;
        }
        if (field === 'tags' && entry.tags?.length) {
            let changed = false;
            const before = [...entry.tags];
            const next = entry.tags.map((tag) => {
                const replaced = replaceString(tag, from, to, match);
                if (replaced !== null) {
                    changed = true;
                    return replaced;
                }
                return tag;
            });
            if (!changed) {
                continue;
            }
            entry.tags = next;
            recordEntryUpdate(changes, entry, 'tags', before, next);
            continue;
        }
        if (field === 'payload') {
            const before = entry.payload;
            const { next, changed } = replaceInPayload(entry.payload, from, to, match);
            if (!changed) {
                continue;
            }
            entry.payload = next;
            recordEntryUpdate(changes, entry, 'payload', before, next);
        }
    }
}
function applyRenameText(state, from, to, fields, match, scope, changes, warnings) {
    for (const entry of state.entries.values()) {
        if (!entryInScope(entry, scope)) {
            continue;
        }
        applyRenameTextToEntry(state, entry, from, to, fields, match, changes, warnings);
    }
    if (!fields.includes('usageExamples')) {
        return;
    }
    for (const module of state.modules.values()) {
        if (!moduleInScope(module, scope)) {
            continue;
        }
        const before = module.usageExamples;
        const { next, changed } = replaceInUsageExamples(module.usageExamples, from, to, match);
        if (!changed || !next) {
            continue;
        }
        module.usageExamples = next;
        recordModuleUpdate(changes, module, 'usageExamples', before, next);
    }
}
function applyPatchEntry(state, match, set, scope, changes, warnings) {
    const entry = findEntryByMatch(state, match, scope);
    if (!entry) {
        pushWarning(warnings, `patch-entry: no entry matched ${JSON.stringify(match)}`);
        return;
    }
    if (set.title !== undefined && set.title !== entry.title) {
        if (hasTitleCollision(state, entry.id, entry.kind, set.title)) {
            pushWarning(warnings, `Skipped patch title for entry ${entry.id}: '${entry.kind}' / '${set.title}' already exists`);
        }
        else {
            const before = entry.title;
            entry.title = set.title;
            recordEntryUpdate(changes, entry, 'title', before, set.title);
        }
    }
    if (set.summary !== undefined && set.summary !== entry.summary) {
        const before = entry.summary;
        entry.summary = set.summary;
        recordEntryUpdate(changes, entry, 'summary', before, set.summary);
    }
    if (set.tags !== undefined) {
        const before = entry.tags ? [...entry.tags] : undefined;
        entry.tags = [...set.tags];
        recordEntryUpdate(changes, entry, 'tags', before, entry.tags);
    }
    if (set.payload !== undefined) {
        const before = entry.payload;
        entry.payload = { ...entry.payload, ...set.payload };
        recordEntryUpdate(changes, entry, 'payload', before, entry.payload);
    }
    if (set.refs !== undefined) {
        const before = entry.refs ? structuredClone(entry.refs) : undefined;
        entry.refs = { ...entry.refs, ...set.refs };
        recordEntryUpdate(changes, entry, 'refs', before, entry.refs);
    }
}
function applyMergeFiles(state, from, to, scope, changes) {
    for (const entry of state.entries.values()) {
        if (!entryInScope(entry, scope)) {
            continue;
        }
        const before = entry.refs?.files ? [...entry.refs.files] : undefined;
        const { next, changed } = mergeFilesList(entry.refs?.files, from, to);
        if (!changed) {
            continue;
        }
        entry.refs = { ...entry.refs, files: next ?? [] };
        recordEntryUpdate(changes, entry, 'refs.files', before, entry.refs.files);
    }
    for (const module of state.modules.values()) {
        if (!moduleInScope(module, scope)) {
            continue;
        }
        const before = module.files ? [...module.files] : undefined;
        const { next, changed } = mergeFilesList(module.files, from, to);
        if (!changed) {
            continue;
        }
        module.files = next;
        recordModuleUpdate(changes, module, 'files', before, next);
    }
}
function applyRemoveFileRef(state, file, deleteIfEmpty, scope, changes) {
    for (const entry of state.entries.values()) {
        if (!entryInScope(entry, scope)) {
            continue;
        }
        const before = entry.refs?.files ? [...entry.refs.files] : undefined;
        const { next, changed } = removeFileFromList(entry.refs?.files, file);
        if (!changed) {
            continue;
        }
        entry.refs = {
            ...entry.refs,
            files: deleteIfEmpty ? next ?? [] : next,
        };
        recordEntryUpdate(changes, entry, 'refs.files', before, entry.refs.files);
    }
    for (const module of state.modules.values()) {
        if (!moduleInScope(module, scope)) {
            continue;
        }
        const before = module.files ? [...module.files] : undefined;
        const { next, changed } = removeFileFromList(module.files, file);
        if (!changed) {
            continue;
        }
        module.files = next;
        recordModuleUpdate(changes, module, 'files', before, next);
    }
}
function cleanupOrphanEntries(state, changes) {
    const deletedIds = [];
    for (const [id, entry] of state.entries.entries()) {
        if (!shouldDeleteOrphan(entry)) {
            continue;
        }
        recordEntryDelete(changes, entry);
        state.entries.delete(id);
        deletedIds.push(id);
    }
    return deletedIds;
}
function computeStats(originalEntries, originalModules, state, deletedIds) {
    let entriesUpdated = 0;
    for (const [id, entry] of state.entries.entries()) {
        const original = originalEntries.get(id);
        if (!original) {
            entriesUpdated += 1;
            continue;
        }
        if (JSON.stringify(original) !== JSON.stringify(entry)) {
            entriesUpdated += 1;
        }
    }
    let modules = 0;
    for (const [id, module] of state.modules.entries()) {
        const original = originalModules.get(id);
        if (original && JSON.stringify(original) !== JSON.stringify(module)) {
            modules += 1;
        }
    }
    return {
        modules,
        entriesUpdated,
        entriesDeleted: deletedIds.length,
    };
}
function buildSummary(dryRun, stats, scanHits) {
    if (scanHits !== undefined) {
        return `scan: ${scanHits} hit${scanHits === 1 ? '' : 's'}`;
    }
    const prefix = dryRun ? 'would ' : '';
    const parts = [
        `${prefix}update ${stats.modules} module${stats.modules === 1 ? '' : 's'}`,
        `${stats.entriesUpdated} entr${stats.entriesUpdated === 1 ? 'y' : 'ies'}`,
    ];
    if (stats.entriesDeleted > 0) {
        parts.push(`delete ${stats.entriesDeleted}`);
    }
    return parts.join(', ');
}
export function executeRefactorDraft(state, request) {
    assertRefactorOperationLimit(request.operations.length);
    const hasScan = request.operations.some((op) => op.type === 'scan');
    if (hasScan) {
        const hits = scanState(state, request.operations, request.scope);
        return {
            hits,
            changes: [],
            warnings: [],
            stats: { modules: 0, entriesUpdated: 0, entriesDeleted: 0, hits: hits.length },
            deletedIds: [],
        };
    }
    const originalEntries = new Map([...state.entries.entries()].map(([id, entry]) => [id, cloneEntry(entry)]));
    const originalModules = new Map([...state.modules.entries()].map(([id, module]) => [id, cloneModule(module)]));
    const changes = [];
    const warnings = [];
    for (const operation of request.operations) {
        switch (operation.type) {
            case 'move-file':
                applyMoveFile(state, operation.from, operation.to, request.scope, changes);
                break;
            case 'replace-path-prefix':
                applyReplacePathPrefix(state, operation.fromPrefix, operation.toPrefix, request.scope, changes);
                break;
            case 'rename-text':
                applyRenameText(state, operation.from, operation.to, operation.fields, operation.match, request.scope, changes, warnings);
                break;
            case 'patch-entry':
                applyPatchEntry(state, operation.match, operation.set, request.scope, changes, warnings);
                break;
            case 'merge-files':
                applyMergeFiles(state, operation.from, operation.to, request.scope, changes);
                break;
            case 'remove-file-ref':
                applyRemoveFileRef(state, operation.file, operation.deleteIfEmpty ?? true, request.scope, changes);
                break;
            default:
                break;
        }
    }
    const deletedIds = cleanupOrphanEntries(state, changes);
    const stats = computeStats(originalEntries, originalModules, state, deletedIds);
    return { changes, warnings, stats, deletedIds, hits: undefined };
}
export function paginateRefactorResult(dryRun, hits, changes, warnings, stats, limit, offset) {
    const pageLimit = clampRefactorLimit(limit);
    const pageOffset = clampRefactorOffset(offset);
    if (hits !== undefined) {
        const pageHits = hits.slice(pageOffset, pageOffset + pageLimit);
        return {
            dryRun,
            summary: buildSummary(dryRun, stats, hits.length),
            stats,
            hits: pageHits,
            changes: [],
            warnings: warnings.slice(0, MAX_REFACTOR_WARNINGS),
            offset: pageOffset,
            hasMore: pageOffset + pageHits.length < hits.length,
        };
    }
    const pageChanges = changes.slice(pageOffset, pageOffset + pageLimit);
    return {
        dryRun,
        summary: buildSummary(dryRun, stats),
        stats,
        changes: pageChanges,
        warnings: warnings.slice(0, MAX_REFACTOR_WARNINGS),
        offset: pageOffset,
        hasMore: pageOffset + pageChanges.length < changes.length,
    };
}
export async function runRefactorArchitecture(projectId, request) {
    const dryRun = request.dryRun ?? true;
    if (!dryRun && request.confirm !== true) {
        throw new Error('confirm=true is required when dryRun=false');
    }
    const architecture = await readArchitecture(projectId);
    const modules = [];
    if (architecture) {
        for (const mod of architecture.modules) {
            const details = await readModule(projectId, mod.id);
            if (details) {
                modules.push(details);
            }
        }
    }
    const entries = await loadEntries(projectId);
    const state = createDraftState(entries, modules);
    const { hits, changes, warnings, stats, deletedIds } = executeRefactorDraft(state, request);
    if (dryRun || hits !== undefined) {
        return paginateRefactorResult(dryRun, hits, changes, warnings, stats, request.limit, request.offset);
    }
    const originalEntries = new Map(entries.map((entry) => [entry.id, entry]));
    for (const [id, entry] of state.entries.entries()) {
        const original = originalEntries.get(id);
        if (!original || JSON.stringify(original) !== JSON.stringify(entry)) {
            await writeEntry(projectId, {
                ...entry,
                updatedAt: new Date().toISOString(),
            });
        }
    }
    for (const deletedId of deletedIds) {
        await deleteEntry(projectId, deletedId);
    }
    const originalModules = new Map(modules.map((module) => [module.moduleId, module]));
    const now = new Date().toISOString();
    for (const [id, module] of state.modules.entries()) {
        const original = originalModules.get(id);
        if (!original || JSON.stringify(original) !== JSON.stringify(module)) {
            await writeModule(projectId, {
                ...module,
                updatedAt: now,
            });
        }
    }
    return paginateRefactorResult(false, undefined, changes, warnings, stats, request.limit, request.offset);
}
//# sourceMappingURL=refactor.js.map