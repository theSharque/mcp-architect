export const MODULE_ENTRIES_REMINDER =
  'After saving a module, add horizontal facts as entries (or pass facts[] here): ' +
  'http-endpoint for controllers, entity/repository for persistence, glossary for domain. ' +
  'Slices (api, domain, persistence) read entries only—modules alone leave slices empty. ' +
  'Link via refs.moduleName; use list-slices for recommended kinds.';

export const ENTRIES_MODULE_REMINDER =
  'Entries need vertical structure: create modules via set-project-architecture / set-module-details ' +
  'before or when adding entries. Set refs.moduleName to an existing module name from list-modules. ' +
  'Run validate after edits to find entries-without-modules, entry-unlinked, or empty slices.';

export const BULK_BATCH_GUIDANCE =
  'Max 50 entries per bulk call—split large catalogs into batches of ~50 to avoid oversized tool payloads. ' +
  'For full re-import: delete-entries once, then set-entries in 50-entry chunks; or replace-entries with deleteOrphans=false until the final batch (deleteOrphans=true).';

export function suggestKindsFromFiles(files: string[]): string[] {
  const kinds = new Set<string>();
  for (const file of files) {
    const lower = file.toLowerCase();
    const base = file.split('/').pop() ?? file;
    if (/controller/i.test(base) || lower.endsWith('.http')) {
      kinds.add('http-endpoint');
    }
    if (/repository/i.test(base)) {
      kinds.add('repository');
    }
    if (/entity/i.test(base) && !/repository/i.test(base)) {
      kinds.add('entity');
    }
  }
  return [...kinds];
}

export interface EntryLinkHints {
  reminder?: string;
  warning?: string;
  suggestedModuleNames?: string[];
}

export function buildEntryLinkHints(
  moduleNames: string[],
  refsModuleName?: string
): EntryLinkHints {
  const hints: EntryLinkHints = {};

  if (moduleNames.length === 0) {
    hints.reminder = ENTRIES_MODULE_REMINDER;
    return hints;
  }

  if (!refsModuleName?.trim()) {
    hints.reminder = ENTRIES_MODULE_REMINDER;
    hints.suggestedModuleNames = moduleNames;
    return hints;
  }

  if (!moduleNames.includes(refsModuleName)) {
    hints.warning = `refs.moduleName '${refsModuleName}' does not match any module (orphan-entry-module).`;
    hints.suggestedModuleNames = moduleNames;
  }

  return hints;
}
