import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  Entry,
  EntryFilter,
  EntryIndex,
  EntryIndexItem,
  ProjectArchitecture,
  ModuleDetails,
  ProjectSummary,
  SliceDefinition,
} from './types.js';

const STORAGE_BASE_DIR = path.join(os.homedir(), '.mcp-architector');

export function getStorageBaseDir(): string {
  return STORAGE_BASE_DIR;
}

/**
 * Get the storage directory for a specific project
 */
export function getProjectDir(projectId: string): string {
  return path.join(STORAGE_BASE_DIR, projectId);
}

/**
 * Get the path to the project architecture file
 */
export function getArchitectureFile(projectId: string): string {
  return path.join(getProjectDir(projectId), 'architecture.json');
}

/**
 * Get the path to a module details file
 */
export function getModuleFile(projectId: string, moduleId: string): string {
  return path.join(getProjectDir(projectId), 'modules', `${moduleId}.json`);
}

/**
 * Ensure the storage directory structure exists
 */
async function ensureDirectoryExists(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Initialize storage for a project
 */
export async function initializeProjectStorage(projectId: string): Promise<void> {
  const projectDir = getProjectDir(projectId);
  await ensureDirectoryExists(projectDir);
  await ensureDirectoryExists(path.join(projectDir, 'modules'));
  await ensureDirectoryExists(path.join(projectDir, 'entries'));
  await ensureDirectoryExists(path.join(projectDir, 'slices'));
}

export function getEntriesDir(projectId: string): string {
  return path.join(getProjectDir(projectId), 'entries');
}

export function getEntryFile(projectId: string, entryId: string): string {
  return path.join(getEntriesDir(projectId), `${entryId}.json`);
}

export function getEntryIndexFile(projectId: string): string {
  return path.join(getEntriesDir(projectId), 'index.json');
}

export function getSliceFile(projectId: string, sliceId: string): string {
  return path.join(getProjectDir(projectId), 'slices', `${sliceId}.json`);
}

async function readEntryIndexRaw(projectId: string): Promise<EntryIndex> {
  try {
    const content = await fs.readFile(getEntryIndexFile(projectId), 'utf-8');
    const parsed = JSON.parse(content) as EntryIndex | EntryIndexItem[];
    if (Array.isArray(parsed)) {
      return { items: parsed };
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { items: [] };
    }
    throw error;
  }
}

export async function readEntryIndex(projectId: string): Promise<EntryIndex> {
  return readEntryIndexRaw(projectId);
}

async function writeEntryIndex(projectId: string, index: EntryIndex): Promise<void> {
  await ensureDirectoryExists(getEntriesDir(projectId));
  await fs.writeFile(getEntryIndexFile(projectId), JSON.stringify(index, null, 2), 'utf-8');
}

function entryToIndexItem(entry: Entry): EntryIndexItem {
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    tags: entry.tags,
    updatedAt: entry.updatedAt,
  };
}

export async function readEntry(projectId: string, entryId: string): Promise<Entry | null> {
  try {
    const content = await fs.readFile(getEntryFile(projectId, entryId), 'utf-8');
    return JSON.parse(content) as Entry;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeEntry(projectId: string, entry: Entry): Promise<void> {
  await initializeProjectStorage(projectId);
  await fs.writeFile(getEntryFile(projectId, entry.id), JSON.stringify(entry, null, 2), 'utf-8');

  const index = await readEntryIndexRaw(projectId);
  const existingIdx = index.items.findIndex((i) => i.id === entry.id);
  const item = entryToIndexItem(entry);
  if (existingIdx >= 0) {
    index.items[existingIdx] = item;
  } else {
    index.items.push(item);
  }
  await writeEntryIndex(projectId, index);
}

export async function deleteEntry(projectId: string, entryId: string): Promise<void> {
  try {
    await fs.unlink(getEntryFile(projectId, entryId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const index = await readEntryIndexRaw(projectId);
  index.items = index.items.filter((i) => i.id !== entryId);
  await writeEntryIndex(projectId, index);
}

export async function listEntryIds(projectId: string): Promise<string[]> {
  const index = await readEntryIndexRaw(projectId);
  return index.items.map((i) => i.id);
}

export async function findEntryByKindTitle(
  projectId: string,
  kind: string,
  title: string
): Promise<Entry | null> {
  const index = await readEntryIndexRaw(projectId);
  const item = index.items.find((i) => i.kind === kind && i.title === title);
  if (!item) {
    return null;
  }
  return readEntry(projectId, item.id);
}

export function filterIndexItems(
  items: EntryIndexItem[],
  filter?: EntryFilter
): EntryIndexItem[] {
  if (!filter) {
    return items;
  }
  return items.filter((item) => {
    if (filter.kinds?.length && !filter.kinds.includes(item.kind)) {
      return false;
    }
    if (filter.tags?.length) {
      const tags = item.tags ?? [];
      if (!filter.tags.some((t) => tags.includes(t))) {
        return false;
      }
    }
    if (filter.query) {
      const q = filter.query.trim().toLowerCase();
      const haystack = [item.title, item.kind, ...(item.tags ?? [])].join(' ').toLowerCase();
      if (!haystack.includes(q)) {
        return false;
      }
    }
    return true;
  });
}

export async function loadEntries(
  projectId: string,
  filter?: EntryFilter
): Promise<Entry[]> {
  const index = await readEntryIndexRaw(projectId);
  const items = filterIndexItems(index.items, filter);
  const entries: Entry[] = [];

  for (const item of items) {
    try {
      const entry = await readEntry(projectId, item.id);
      if (entry) {
        entries.push(entry);
      }
    } catch {
      continue;
    }
  }

  return entries;
}

export async function rebuildEntryIndex(projectId: string): Promise<EntryIndex> {
  await ensureDirectoryExists(getEntriesDir(projectId));
  let files: string[];
  try {
    files = await fs.readdir(getEntriesDir(projectId));
  } catch {
    return { items: [] };
  }

  const items: EntryIndexItem[] = [];
  for (const file of files) {
    if (!file.endsWith('.json') || file === 'index.json') {
      continue;
    }
    const entryId = file.replace('.json', '');
    try {
      const entry = await readEntry(projectId, entryId);
      if (entry) {
        items.push(entryToIndexItem(entry));
      }
    } catch {
      continue;
    }
  }

  const index = await readEntryIndexRaw(projectId);
  const rebuilt: EntryIndex = { items, migratedScripts: index.migratedScripts };
  await writeEntryIndex(projectId, rebuilt);
  return rebuilt;
}

export async function readSlice(
  projectId: string,
  sliceId: string
): Promise<SliceDefinition | null> {
  try {
    const content = await fs.readFile(getSliceFile(projectId, sliceId), 'utf-8');
    return JSON.parse(content) as SliceDefinition;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeSlice(
  projectId: string,
  slice: SliceDefinition
): Promise<void> {
  await initializeProjectStorage(projectId);
  await fs.writeFile(getSliceFile(projectId, slice.id), JSON.stringify(slice, null, 2), 'utf-8');
}

export async function deleteSlice(projectId: string, sliceId: string): Promise<void> {
  try {
    await fs.unlink(getSliceFile(projectId, sliceId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function listSliceIds(projectId: string): Promise<string[]> {
  try {
    const dir = path.join(getProjectDir(projectId), 'slices');
    const files = await fs.readdir(dir);
    return files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function setMigratedScriptsFlag(projectId: string): Promise<void> {
  const index = await readEntryIndexRaw(projectId);
  index.migratedScripts = true;
  await writeEntryIndex(projectId, index);
}

export async function isScriptsMigrated(projectId: string): Promise<boolean> {
  const index = await readEntryIndexRaw(projectId);
  return index.migratedScripts === true;
}

/**
 * Read project architecture from storage
 */
export async function readArchitecture(projectId: string): Promise<ProjectArchitecture | null> {
  try {
    const filePath = getArchitectureFile(projectId);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ProjectArchitecture;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write project architecture to storage
 */
export async function writeArchitecture(
  projectId: string,
  architecture: ProjectArchitecture
): Promise<void> {
  await initializeProjectStorage(projectId);
  const filePath = getArchitectureFile(projectId);
  await fs.writeFile(filePath, JSON.stringify(architecture, null, 2), 'utf-8');
}

/**
 * Read module details from storage
 */
export async function readModule(projectId: string, moduleId: string): Promise<ModuleDetails | null> {
  try {
    const filePath = getModuleFile(projectId, moduleId);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ModuleDetails;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write module details to storage
 */
export async function writeModule(
  projectId: string,
  moduleDetails: ModuleDetails
): Promise<void> {
  await initializeProjectStorage(projectId);
  const filePath = getModuleFile(projectId, moduleDetails.moduleId);
  await fs.writeFile(filePath, JSON.stringify(moduleDetails, null, 2), 'utf-8');
}

/**
 * List all modules in a project
 */
export async function listModules(projectId: string): Promise<string[]> {
  try {
    const modulesDir = path.join(getProjectDir(projectId), 'modules');
    const files = await fs.readdir(modulesDir);
    return files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Delete a module
 */
export async function deleteModule(projectId: string, moduleId: string): Promise<void> {
  const filePath = getModuleFile(projectId, moduleId);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function listProjects(
  currentProjectId?: string | null,
  query?: string
): Promise<ProjectSummary[]> {
  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = await fs.readdir(STORAGE_BASE_DIR, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const summaries = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const projectId = entry.name;
        let architecture: ProjectArchitecture | null = null;
        try {
          architecture = await readArchitecture(projectId);
        } catch {
          architecture = null;
        }
        const dirStat = await fs.stat(getProjectDir(projectId));

        if (architecture) {
          return {
            projectId,
            description: architecture.description,
            moduleCount: architecture.modules.length,
            updatedAt: architecture.updatedAt,
            isCurrent: projectId === currentProjectId,
          };
        }

        const moduleCount = (await listModules(projectId)).length;
        return {
          projectId,
          description: '',
          moduleCount,
          updatedAt: dirStat.mtime.toISOString(),
          isCurrent: projectId === currentProjectId,
        };
      })
  );

  const normalizedQuery = query?.trim().toLowerCase();
  const filtered = normalizedQuery
    ? summaries.filter(
        (p) =>
          p.projectId.toLowerCase().includes(normalizedQuery) ||
          p.description.toLowerCase().includes(normalizedQuery)
      )
    : summaries;

  return filtered.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Normalize project ID from workdir or user input
 */
export function normalizeProjectId(workdir?: string): string {
  if (!workdir || workdir === '') {
    throw new Error('Project ID is required (workdir context)');
  }

  // Use workdir as project ID, normalized for filesystem
  return workdir.replace(/[^a-zA-Z0-9_-]/g, '_');
}

