import { z } from "zod";
export declare const PROJECT_ID_PARAM_DESCRIPTION = "Required. Call list-projects first (query by workspace folder name) and pass the matching projectId. Never omit. default-project is forbidden.";
export declare const PROJECT_ID_LIST_REMINDER = "projectId is required on every other tool. Match this workspace by folder name via query. Never use default-project. If none matches, create one with set-project-architecture using a stable id from the workspace path (e.g. _qs_my-app).";
export declare const PROJECT_ID_MISSING_ERROR = "projectId is required. Call list-projects (query by workspace folder name) and pass the matching projectId. There is no default project.";
export declare const projectIdSchema: z.ZodString;
export type ProjectIdResolver = (provided?: string) => string;
export declare function isForbiddenProjectId(projectId: string): boolean;
export declare function forbiddenProjectIdError(projectId: string): Error;
export declare function resolveProjectId(provided?: string): string;
//# sourceMappingURL=project-id.d.ts.map