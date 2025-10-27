/**
 * Type definitions for MCP Architector
 */

export interface DataFlow {
  [moduleName: string]: {
    dependsOn?: string[];
    providesTo?: string[];
    dataTransformation?: string;
  };
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

export interface ScriptDocumentation {
  scriptId: string;
  scriptName: string;
  description: string;
  usage: string;
  examples: string[];
  parameters: Record<string, string>; // parameter name -> description
  notes?: string;
  createdAt: string;
  updatedAt: string;
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

