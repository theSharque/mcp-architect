import type { ProjectArchitecture, ModuleDetails, ScriptDocumentation } from './types.js';
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
/**
 * Get the path to a script documentation file
 */
export declare function getScriptFile(projectId: string, scriptId: string): string;
/**
 * Read script documentation from storage
 */
export declare function readScript(projectId: string, scriptId: string): Promise<ScriptDocumentation | null>;
/**
 * Write script documentation to storage
 */
export declare function writeScript(projectId: string, scriptDoc: ScriptDocumentation): Promise<void>;
/**
 * List all scripts in a project
 */
export declare function listScripts(projectId: string): Promise<string[]>;
/**
 * Normalize project ID from workdir or user input
 */
export declare function normalizeProjectId(workdir?: string): string;
//# sourceMappingURL=storage.d.ts.map