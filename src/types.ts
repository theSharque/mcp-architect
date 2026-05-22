/**
 * Type definitions for MCP Architector
 */

export type SliceFormat = 'compact' | 'detail' | 'table';

export interface EntryRefs {
  moduleName?: string;
  files?: string[];
  entryIds?: string[];
}

export interface Entry {
  id: string;
  kind: string;
  title: string;
  summary: string;
  payload?: Record<string, unknown>;
  refs?: EntryRefs;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EntryIndexItem {
  id: string;
  kind: string;
  title: string;
  tags?: string[];
  updatedAt: string;
}

export interface EntryIndex {
  items: EntryIndexItem[];
  migratedScripts?: boolean;
}

export interface SliceFilter {
  kinds?: string[];
  tags?: string[];
}

export interface SliceDefinition {
  id: string;
  title: string;
  description?: string;
  filter: SliceFilter;
  createdAt: string;
  updatedAt: string;
}

export interface BuiltinSliceInfo {
  id: string;
  title: string;
  description: string;
  kinds: string[];
}

export interface DataFlow {
  [moduleName: string]: {
    dependsOn?: string[];
    providesTo?: string[];
    dataTransformation?: string;
  };
}

export interface ProjectSummary {
  projectId: string;
  description: string;
  moduleCount: number;
  updatedAt: string;
  isCurrent: boolean;
}

export interface ProjectArchitecture {
  projectId: string;
  description: string;
  modules: ModuleSummary[];
  dataFlow?: DataFlow;
  createdAt: string;
  updatedAt: string;
}

export interface ModuleSummary {
  id: string;
  name: string;
  description: string;
  inputs?: string;
  outputs?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UsageExample {
  title: string;
  description?: string;
  command?: string;
  input?: string;
  output?: string;
  notes?: string;
}

export interface ModuleDetails {
  moduleId: string;
  name: string;
  description: string;
  inputs: string;
  outputs: string;
  dependencies?: string[];
  files?: string[];
  usageExamples?: UsageExample[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EntryFilter {
  kinds?: string[];
  tags?: string[];
  query?: string;
}

export interface SliceBuildOptions {
  format: SliceFormat;
  limit: number;
  query?: string;
  includeModuleContext?: boolean;
}

export interface CompactEntryRow {
  id: string;
  kind: string;
  title: string;
  summary: string;
  refs?: EntryRefs;
  moduleContext?: { name: string; description: string };
}

export interface SliceResponse {
  sliceId: string;
  title: string;
  format: SliceFormat;
  total: number;
  returned: number;
  items: CompactEntryRow[] | Entry[] | Record<string, unknown>[];
}
