import { promises as fs } from 'node:fs';
import { validateDataFlow } from './data-flow.js';
import { validateEntryCoverage, validateModuleEntryCounts } from './entry-coverage.js';
import { loadCustomSlices, validateSliceCoverage } from './slice-coverage.js';
import { BUILTIN_SLICES, countEntriesForKinds } from './slices.js';
import {
  getEntriesDir,
  listModules,
  loadEntries,
  readArchitecture,
  readEntry,
  readEntryIndex,
  readModule,
} from './storage.js';
import type {
  EntryCoverageSummary,
  ModuleDetails,
  ProjectArchitecture,
  ProjectValidationResult,
  ValidationIssue,
} from './types.js';

const SLICE_EMPTY_CHECK_IDS = ['api', 'domain', 'persistence'] as const;

export interface ProjectValidationOptions {
  checkInverse?: boolean;
  checkModuleDeps?: boolean;
  checkEntryCoverage?: boolean;
  checkStorage?: boolean;
  checkEmptySlices?: boolean;
  checkSliceCoverage?: boolean;
  checkModuleEntryCounts?: boolean;
  moduleEntryMax?: number;
  moduleEntryMin?: number;
}

function emptyCoverage(): EntryCoverageSummary {
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

function mergeCoverage(
  base: EntryCoverageSummary,
  patch: Partial<EntryCoverageSummary>
): EntryCoverageSummary {
  return { ...base, ...patch };
}

async function countEntryFilesOnDisk(projectId: string): Promise<number> {
  try {
    const files = await fs.readdir(getEntriesDir(projectId));
    return files.filter((f) => f.endsWith('.json') && f !== 'index.json').length;
  } catch {
    return 0;
  }
}

function validateModuleFiles(
  architecture: ProjectArchitecture | null,
  moduleDetailsMap: Map<string, ModuleDetails>,
  moduleFileIds: string[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!architecture) {
    return issues;
  }

  const archIds = new Set(architecture.modules.map((m) => m.id));

  for (const mod of architecture.modules) {
    if (!moduleDetailsMap.has(mod.name)) {
      issues.push({
        kind: 'missing-module-details',
        module: mod.name,
        detail: `Module '${mod.name}' is in architecture but has no modules/${mod.id}.json—call set-module-details`,
      });
    }
  }

  for (const fileId of moduleFileIds) {
    if (!archIds.has(fileId)) {
      issues.push({
        kind: 'orphan-module-file',
        module: fileId,
        detail: `Orphan module file modules/${fileId}.json—not listed in architecture.modules`,
      });
    }
  }

  return issues;
}

async function validateEntryIndexDrift(projectId: string): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const index = await readEntryIndex(projectId);
  const onDisk = await countEntryFilesOnDisk(projectId);

  if (index.items.length !== onDisk) {
    issues.push({
      kind: 'index-count-mismatch',
      module: '',
      detail: `entries/index.json has ${index.items.length} items but ${onDisk} entry files on disk—run rebuild-entry-index`,
    });
  }

  for (const item of index.items) {
    const entry = await readEntry(projectId, item.id);
    if (!entry) {
      issues.push({
        kind: 'index-missing-entry-file',
        module: item.id,
        detail: `Index references entry id '${item.id}' but file is missing or unreadable`,
      });
    }
  }

  return issues;
}

function validateEmptyBuiltinSlices(
  architecture: ProjectArchitecture | null,
  indexItems: { kind: string }[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!architecture || architecture.modules.length === 0) {
    return issues;
  }

  for (const sliceId of SLICE_EMPTY_CHECK_IDS) {
    const builtin = BUILTIN_SLICES.find((b) => b.id === sliceId);
    if (!builtin) {
      continue;
    }
    const count = countEntriesForKinds(indexItems, builtin.kinds);
    if (count === 0) {
      issues.push({
        kind: 'slice-empty',
        module: sliceId,
        detail: `Built-in slice '${sliceId}' has 0 entries (kinds: ${builtin.kinds.slice(0, 3).join(', ')}…)—add facts or set-entry with matching kinds`,
      });
    }
  }

  return issues;
}

function groupIssuesByKind(issues: ValidationIssue[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const issue of issues) {
    map[issue.kind] = (map[issue.kind] ?? 0) + 1;
  }
  return map;
}

function buildSummary(valid: boolean, issueCount: number, issuesByKind: Record<string, number>): string {
  if (valid) {
    return 'Project validation passed: modules, entries, dataFlow, and index are consistent.';
  }
  const top = Object.entries(issuesByKind)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, n]) => `${k}(${n})`)
    .join(', ');
  return `Validation failed: ${issueCount} issue(s). Top kinds: ${top}. Fix issues[] then run validate again.`;
}

async function loadModuleDetailsMap(
  projectId: string,
  architecture: ProjectArchitecture
): Promise<Map<string, ModuleDetails>> {
  const map = new Map<string, ModuleDetails>();
  for (const mod of architecture.modules) {
    const details = await readModule(projectId, mod.id);
    if (details) {
      map.set(mod.name, details);
    }
  }
  return map;
}

export async function runProjectValidation(
  projectId: string,
  options: ProjectValidationOptions = {}
): Promise<ProjectValidationResult> {
  const checkInverse = options.checkInverse ?? true;
  const checkModuleDeps = options.checkModuleDeps ?? true;
  const checkEntryCoverage = options.checkEntryCoverage ?? true;
  const checkStorage = options.checkStorage ?? true;
  const checkEmptySlices = options.checkEmptySlices ?? true;
  const checkSliceCoverage = options.checkSliceCoverage ?? true;
  const checkModuleEntryCounts = options.checkModuleEntryCounts ?? true;
  const checksRun: string[] = [];

  const architecture = await readArchitecture(projectId);
  const moduleDetailsMap = architecture
    ? await loadModuleDetailsMap(projectId, architecture)
    : new Map<string, ModuleDetails>();
  const entries = await loadEntries(projectId);
  const index = await readEntryIndex(projectId);
  const entryFilesOnDisk = await countEntryFilesOnDisk(projectId);
  const moduleFileIds = await listModules(projectId);

  const issues: ValidationIssue[] = [];
  let coverage: EntryCoverageSummary | undefined;

  if (!architecture) {
    checksRun.push('architecture-presence');
    issues.push({
      kind: 'missing-architecture',
      module: '',
      detail: 'No architecture found—call set-project-architecture',
    });
    if (checkEntryCoverage && entries.length > 0) {
      checksRun.push('entry-coverage');
      const entryResult = validateEntryCoverage(null, entries, moduleDetailsMap);
      issues.push(...entryResult.issues);
      coverage = entryResult.coverage;
    }
  } else {
    checksRun.push('dataFlow');
    issues.push(
      ...validateDataFlow(architecture, moduleDetailsMap, {
        checkInverse,
        checkModuleDeps,
      })
    );

    if (checkEntryCoverage) {
      checksRun.push('entry-coverage');
      const entryResult = validateEntryCoverage(architecture, entries, moduleDetailsMap);
      issues.push(...entryResult.issues);
      coverage = entryResult.coverage;
    }

    if (checkModuleEntryCounts) {
      checksRun.push('module-entry-counts');
      const countResult = validateModuleEntryCounts(architecture, entries, {
        moduleEntryMax: options.moduleEntryMax,
        moduleEntryMin: options.moduleEntryMin,
      });
      issues.push(...countResult.issues);
      coverage = mergeCoverage(coverage ?? emptyCoverage(), {
        modulesTooManyEntries: countResult.modulesTooManyEntries,
        modulesTooFewEntries: countResult.modulesTooFewEntries,
      });
    }

    if (checkStorage) {
      checksRun.push('module-files');
      issues.push(...validateModuleFiles(architecture, moduleDetailsMap, moduleFileIds));
    }
  }

  if (checkSliceCoverage && entries.length > 0) {
    checksRun.push('slice-coverage');
    const customSlices = await loadCustomSlices(projectId);
    const sliceResult = validateSliceCoverage(entries, customSlices);
    issues.push(...sliceResult.issues);
    coverage = mergeCoverage(coverage ?? emptyCoverage(), {
      entriesSliceOrphan: sliceResult.entriesSliceOrphan,
    });
  }

  if (checkStorage) {
    checksRun.push('entry-index');
    issues.push(...(await validateEntryIndexDrift(projectId)));
  }

  if (checkEmptySlices) {
    checksRun.push('empty-slices');
    issues.push(...validateEmptyBuiltinSlices(architecture, index.items));
  }

  const issuesByKind = groupIssuesByKind(issues);
  const valid = issues.length === 0;

  return {
    projectId,
    valid,
    issueCount: issues.length,
    summary: buildSummary(valid, issues.length, issuesByKind),
    stats: {
      moduleCount: architecture?.modules.length ?? 0,
      entryCount: entries.length,
      entryFilesOnDisk,
      indexItemCount: index.items.length,
    },
    issuesByKind,
    issues,
    coverage,
    checksRun,
  };
}
