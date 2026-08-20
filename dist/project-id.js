import { z } from "zod";
export const PROJECT_ID_PARAM_DESCRIPTION = "Required. Call list-projects first (query by workspace folder name) and pass the matching projectId. Never omit. default-project is forbidden.";
export const PROJECT_ID_LIST_REMINDER = "projectId is required on every other tool. Match this workspace by folder name via query. Never use default-project. If none matches, create one with set-project-architecture using a stable id from the workspace path (e.g. _qs_my-app).";
export const PROJECT_ID_MISSING_ERROR = "projectId is required. Call list-projects (query by workspace folder name) and pass the matching projectId. There is no default project.";
export const projectIdSchema = z.string().min(1).describe(PROJECT_ID_PARAM_DESCRIPTION);
export function isForbiddenProjectId(projectId) {
    const id = projectId.trim();
    if (!id) {
        return true;
    }
    if (id.toLowerCase() === "default-project") {
        return true;
    }
    if (/workspacefolder/i.test(id)) {
        return true;
    }
    return false;
}
export function forbiddenProjectIdError(projectId) {
    return new Error(`Project id '${projectId}' is forbidden (shared dump). Call list-projects, match this workspace, and pass that projectId.`);
}
export function resolveProjectId(provided) {
    const explicit = provided?.trim();
    if (!explicit) {
        throw new Error(PROJECT_ID_MISSING_ERROR);
    }
    if (isForbiddenProjectId(explicit)) {
        throw forbiddenProjectIdError(explicit);
    }
    return explicit;
}
//# sourceMappingURL=project-id.js.map