import { v4 as uuidv4 } from 'uuid';
import {
  deleteEntry,
  findEntryByKindTitle,
  loadEntries,
  readArchitecture,
  writeEntry,
} from './storage.js';
import type {
  DeleteEntriesResult,
  Entry,
  EntryFilter,
  EntryRefs,
  ImportStats,
  ImportValidationResult,
  ImportValidationWarning,
  ModuleFactInput,
  ReplaceEntriesResult,
  ReplaceEntriesScope,
  UpsertFactsResult,
  UpsertKeyField,
} from './types.js';

export const MAX_BULK_ENTRIES = 50;

export function assertBulkEntryLimit(count: number, operation = 'bulk operation'): void {
  if (count > MAX_BULK_ENTRIES) {
    throw new Error(
      `Too many entries for ${operation}: max ${MAX_BULK_ENTRIES} per call. Split into batches of ~${MAX_BULK_ENTRIES}.`
    );
  }
}

export function resolveEntryRefs(
  fact: ModuleFactInput,
  batchModuleName?: string
): EntryRefs | undefined {
  const moduleName = fact.refs?.moduleName ?? batchModuleName;
  const refs: EntryRefs = {
    ...fact.refs,
    moduleName,
  };
  const hasRefs =
    refs.moduleName ||
    (refs.files && refs.files.length > 0) ||
    (refs.entryIds && refs.entryIds.length > 0);
  return hasRefs ? refs : undefined;
}

export function buildUpsertKey(
  entry: { kind: string; title: string; id?: string },
  upsertBy: UpsertKeyField[]
): string {
  return upsertBy
    .map((field) => {
      if (field === 'kind') {
        return entry.kind;
      }
      if (field === 'title') {
        return entry.title;
      }
      return entry.id ?? '';
    })
    .join('\0');
}

export function scopeToEntryFilter(scope: ReplaceEntriesScope): EntryFilter {
  return {
    kind: scope.kind,
    kinds: scope.kinds,
    moduleName: scope.moduleName,
    tags: scope.tags,
  };
}

export function matchesEntryScope(entry: Entry, scope: ReplaceEntriesScope): boolean {
  const filter = scopeToEntryFilter(scope);
  if (filter.kind || filter.kinds?.length) {
    const kinds = filter.kinds ?? (filter.kind ? [filter.kind] : []);
    if (kinds.length && !kinds.includes(entry.kind)) {
      return false;
    }
  }
  if (filter.moduleName && entry.refs?.moduleName !== filter.moduleName) {
    return false;
  }
  if (filter.tags?.length) {
    const entryTags = entry.tags ?? [];
    if (!filter.tags.some((tag) => entryTags.includes(tag))) {
      return false;
    }
  }
  return true;
}

export async function upsertFacts(
  projectId: string,
  facts: ModuleFactInput[],
  batchModuleName?: string
): Promise<UpsertFactsResult> {
  assertBulkEntryLimit(facts.length, 'set-entries');

  const now = new Date().toISOString();
  let entriesCreated = 0;
  let entriesUpdated = 0;
  const entryIds: string[] = [];

  for (const fact of facts) {
    const existing = await findEntryByKindTitle(projectId, fact.kind, fact.title);
    const entryId = existing?.id ?? uuidv4();
    const refs = resolveEntryRefs(fact, batchModuleName);

    const entry: Entry = {
      id: entryId,
      kind: fact.kind,
      title: fact.title,
      summary: fact.summary,
      payload: fact.payload,
      refs,
      tags: fact.tags,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await writeEntry(projectId, entry);
    entryIds.push(entryId);
    if (existing) {
      entriesUpdated += 1;
    } else {
      entriesCreated += 1;
    }
  }

  return { entriesCreated, entriesUpdated, entryIds };
}

export async function deleteEntriesByFilter(
  projectId: string,
  filter: EntryFilter
): Promise<DeleteEntriesResult> {
  const entries = await loadEntries(projectId, filter);
  for (const entry of entries) {
    await deleteEntry(projectId, entry.id);
  }
  return { deleted: entries.length };
}

export async function replaceEntries(
  projectId: string,
  scope: ReplaceEntriesScope,
  entries: ModuleFactInput[],
  options?: {
    upsertBy?: UpsertKeyField[];
    deleteOrphans?: boolean;
    batchModuleName?: string;
  }
): Promise<ReplaceEntriesResult> {
  assertBulkEntryLimit(entries.length, 'replace-entries');

  const upsertBy = options?.upsertBy ?? ['kind', 'title'];
  const deleteOrphans = options?.deleteOrphans ?? true;
  const scopeHasFilter = Boolean(
    scope.kind || scope.kinds?.length || scope.moduleName || scope.tags?.length
  );
  if (deleteOrphans && !scopeHasFilter) {
    throw new Error('deleteOrphans requires scope with kind, moduleName, or tags');
  }
  const existingInScope = await loadEntries(projectId, scopeToEntryFilter(scope));
  const existingByKey = new Map(
    existingInScope.map((entry) => [buildUpsertKey(entry, upsertBy), entry])
  );

  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  const entryIds: string[] = [];
  const seenKeys = new Set<string>();

  for (const fact of entries) {
    const key = buildUpsertKey(fact, upsertBy);
    seenKeys.add(key);
    const existing = existingByKey.get(key) ?? (await findEntryByKindTitle(projectId, fact.kind, fact.title));
    const entryId = existing?.id ?? uuidv4();
    const refs = resolveEntryRefs(fact, options?.batchModuleName);

    const entry: Entry = {
      id: entryId,
      kind: fact.kind,
      title: fact.title,
      summary: fact.summary,
      payload: fact.payload,
      refs,
      tags: fact.tags,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await writeEntry(projectId, entry);
    entryIds.push(entryId);
    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  let deleted = 0;
  if (deleteOrphans) {
    for (const existing of existingInScope) {
      const key = buildUpsertKey(existing, upsertBy);
      if (!seenKeys.has(key)) {
        await deleteEntry(projectId, existing.id);
        deleted += 1;
      }
    }
  }

  return { created, updated, deleted, entryIds };
}

export function computeImportStats(entries: Entry[]): ImportStats {
  const byKind: Record<string, number> = {};
  const byModule: Record<string, number> = {};
  const byTag: Record<string, number> = {};

  for (const entry of entries) {
    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
    const moduleName = entry.refs?.moduleName;
    if (moduleName) {
      byModule[moduleName] = (byModule[moduleName] ?? 0) + 1;
    }
    for (const tag of entry.tags ?? []) {
      byTag[tag] = (byTag[tag] ?? 0) + 1;
    }
  }

  return { byKind, byModule, byTag, total: entries.length };
}

export async function validateImportEntries(
  projectId: string,
  entries: ModuleFactInput[],
  options?: {
    upsertBy?: UpsertKeyField[];
    checkDuplicates?: boolean;
    checkModuleExists?: boolean;
  }
): Promise<ImportValidationResult> {
  assertBulkEntryLimit(entries.length, 'validate-import');

  const upsertBy = options?.upsertBy ?? ['kind', 'title'];
  const checkDuplicates = options?.checkDuplicates ?? true;
  const checkModuleExists = options?.checkModuleExists ?? true;
  const warnings: ImportValidationWarning[] = [];

  if (checkDuplicates) {
    const seen = new Map<string, number>();
    entries.forEach((entry, index) => {
      const key = buildUpsertKey(entry, upsertBy);
      const firstIndex = seen.get(key);
      if (firstIndex !== undefined) {
        warnings.push({
          code: 'duplicate-key',
          detail: `Duplicate ${upsertBy.join('+')} at indices ${firstIndex} and ${index}: ${entry.kind} / ${entry.title}`,
          entryIndex: index,
        });
      } else {
        seen.set(key, index);
      }
    });
  }

  if (checkModuleExists) {
    const architecture = await readArchitecture(projectId);
    const moduleNames = new Set(architecture?.modules.map((module) => module.name) ?? []);
    if (moduleNames.size > 0) {
      entries.forEach((entry, index) => {
        const moduleName = entry.refs?.moduleName;
        if (moduleName && !moduleNames.has(moduleName)) {
          warnings.push({
            code: 'unknown-module',
            detail: `Unknown module '${moduleName}' for ${entry.kind} / ${entry.title}`,
            entryIndex: index,
          });
        }
      });
    }
  }

  return {
    valid: warnings.length === 0,
    warningCount: warnings.length,
    warnings,
  };
}
