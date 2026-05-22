import type { ProjectValidationResult } from './types.js';
export interface ProjectValidationOptions {
    checkInverse?: boolean;
    checkModuleDeps?: boolean;
    checkEntryCoverage?: boolean;
    checkStorage?: boolean;
    checkEmptySlices?: boolean;
}
export declare function runProjectValidation(projectId: string, options?: ProjectValidationOptions): Promise<ProjectValidationResult>;
//# sourceMappingURL=project-validate.d.ts.map