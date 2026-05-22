import { v4 as uuidv4 } from 'uuid';
import { findEntryByKindTitle, writeEntry } from './storage.js';
import type { Entry, EntryRefs, ModuleFactInput, UpsertFactsResult } from './types.js';

export const MAX_BULK_ENTRIES = 200;

export async function upsertFacts(
  projectId: string,
  facts: ModuleFactInput[],
  moduleName?: string
): Promise<UpsertFactsResult> {
  if (facts.length > MAX_BULK_ENTRIES) {
    throw new Error(`Too many facts: max ${MAX_BULK_ENTRIES} per call`);
  }

  const now = new Date().toISOString();
  let entriesCreated = 0;
  let entriesUpdated = 0;
  const entryIds: string[] = [];

  for (const fact of facts) {
    const existing = await findEntryByKindTitle(projectId, fact.kind, fact.title);
    const entryId = existing?.id ?? uuidv4();
    const refs: EntryRefs | undefined = moduleName
      ? { ...fact.refs, moduleName }
      : fact.refs;

    const hasRefs =
      refs &&
      (refs.moduleName || (refs.files && refs.files.length > 0) || (refs.entryIds && refs.entryIds.length > 0));

    const entry: Entry = {
      id: entryId,
      kind: fact.kind,
      title: fact.title,
      summary: fact.summary,
      payload: fact.payload,
      refs: hasRefs ? refs : undefined,
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
