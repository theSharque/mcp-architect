import type { Entry, EntryFilter, EntryIndex, EntryIndexItem, ProjectArchitecture, ModuleDetails, ProjectSummary, SliceDefinition } from './types.js';
export declare function getStorageBaseDir(): string;
/**
 * Get the storage directory for a specific project
 */
export declare function getProjectDir(projectId: string): string;
/**
 * Get the path to the project architecture file
 */
export declare function getArchitectureFile(projectId: string): string;
/**
 * Get the path to a module details file
 */
export declare function getModuleFile(projectId: string, moduleId: string): string;
/**
 * Initialize storage for a project
 */
export declare function initializeProjectStorage(projectId: string): Promise<void>;
export declare function getEntriesDir(projectId: string): string;
export declare function getEntryFile(projectId: string, entryId: string): string;
export declare function getEntryIndexFile(projectId: string): string;
export declare function getSliceFile(projectId: string, sliceId: string): string;
export declare function readEntryIndex(projectId: string): Promise<EntryIndex>;
export declare function matchesEntryFilterFields(item: Pick<EntryIndexItem, 'kind' | 'title' | 'tags' | 'moduleName'>, filter?: EntryFilter): boolean;
export declare function readEntry(projectId: string, entryId: string): Promise<Entry | null>;
export declare function writeEntry(projectId: string, entry: Entry): Promise<void>;
export declare function deleteEntry(projectId: string, entryId: string): Promise<void>;
export declare function listEntryIds(projectId: string): Promise<string[]>;
export declare function findEntryByKindTitle(projectId: string, kind: string, title: string): Promise<Entry | null>;
export declare function filterIndexItems(items: EntryIndexItem[], filter?: EntryFilter): EntryIndexItem[];
export declare function loadEntries(projectId: string, filter?: EntryFilter): Promise<Entry[]>;
export declare function rebuildEntryIndex(projectId: string): Promise<EntryIndex>;
export declare function readSlice(projectId: string, sliceId: string): Promise<SliceDefinition | null>;
export declare function writeSlice(projectId: string, slice: SliceDefinition): Promise<void>;
export declare function deleteSlice(projectId: string, sliceId: string): Promise<void>;
export declare function listSliceIds(projectId: string): Promise<string[]>;
export declare function setMigratedScriptsFlag(projectId: string): Promise<void>;
export declare function isScriptsMigrated(projectId: string): Promise<boolean>;
/**
 * Read project architecture from storage
 */
export declare function readArchitecture(projectId: string): Promise<ProjectArchitecture | null>;
/**
 * Write project architecture to storage
 */
export declare function writeArchitecture(projectId: string, architecture: ProjectArchitecture): Promise<void>;
/**
 * Read module details from storage
 */
export declare function readModule(projectId: string, moduleId: string): Promise<ModuleDetails | null>;
/**
 * Write module details to storage
 */
export declare function writeModule(projectId: string, moduleDetails: ModuleDetails): Promise<void>;
/**
 * List all modules in a project
 */
export declare function listModules(projectId: string): Promise<string[]>;
/**
 * Delete a module
 */
export declare function deleteModule(projectId: string, moduleId: string): Promise<void>;
export declare function listProjects(currentProjectId?: string | null, query?: string): Promise<ProjectSummary[]>;
/**
 * Normalize project ID from workdir or user input
 */
export declare function normalizeProjectId(workdir?: string): string;
//# sourceMappingURL=storage.d.ts.map