import { z } from 'zod';
import { MAX_REFACTOR_OPERATIONS, runRefactorArchitecture, } from './refactor.js';
const refactorTextFieldSchema = z.enum([
    'title',
    'summary',
    'tags',
    'payload',
    'usageExamples',
]);
const refactorScopeSchema = z
    .object({
    moduleName: z.string().optional(),
    kinds: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
})
    .optional();
const refactorOperationSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('scan'),
        file: z.string().optional(),
        text: z.string().optional(),
    }),
    z.object({
        type: z.literal('move-file'),
        from: z.string(),
        to: z.string(),
    }),
    z.object({
        type: z.literal('replace-path-prefix'),
        fromPrefix: z.string(),
        toPrefix: z.string(),
    }),
    z.object({
        type: z.literal('rename-text'),
        from: z.string(),
        to: z.string(),
        fields: z.array(refactorTextFieldSchema).min(1),
        match: z.enum(['exact', 'contains']),
    }),
    z.object({
        type: z.literal('patch-entry'),
        match: z.object({
            id: z.string().optional(),
            kind: z.string().optional(),
            title: z.string().optional(),
        }),
        set: z.object({
            title: z.string().optional(),
            summary: z.string().optional(),
            payload: z.record(z.string(), z.unknown()).optional(),
            refs: z
                .object({
                moduleName: z.string().optional(),
                files: z.array(z.string()).optional(),
                entryIds: z.array(z.string()).optional(),
            })
                .optional(),
            tags: z.array(z.string()).optional(),
        }),
    }),
    z.object({
        type: z.literal('merge-files'),
        from: z.array(z.string()).min(1),
        to: z.string(),
    }),
    z.object({
        type: z.literal('remove-file-ref'),
        file: z.string(),
        deleteIfEmpty: z.boolean().optional(),
    }),
]);
export function registerRefactorTools(server, resolveProjectId) {
    server.registerTool('refactor-architecture', {
        title: 'Refactor Architecture',
        description: 'Preview or apply in-repo refactor sync to architector data (no workspace access). Default dryRun=true. Workflow: (1) scan with file/text to list hits, (2) build 1-3 mutation ops, (3) dryRun preview, (4) apply with dryRun=false and confirm=true. Mutations: move-file, replace-path-prefix, rename-text, patch-entry, merge-files, remove-file-ref. Orphan entries with empty refs.files and no entryIds are deleted. Does not change module names or dataFlow.',
        inputSchema: {
            projectId: z.string().optional().describe('Project ID (defaults to normalized workdir)'),
            operations: z
                .array(refactorOperationSchema)
                .min(1)
                .max(MAX_REFACTOR_OPERATIONS)
                .describe(`Refactor operations (max ${MAX_REFACTOR_OPERATIONS} per call)`),
            scope: refactorScopeSchema.describe('Optional filter: moduleName, kinds, tags'),
            dryRun: z
                .boolean()
                .optional()
                .describe('Preview only (default true). Set false with confirm=true to apply'),
            confirm: z
                .boolean()
                .optional()
                .describe('Required true when dryRun=false'),
            limit: z
                .number()
                .optional()
                .describe('Max changes/hits per page (default 15, max 50)'),
            offset: z.number().optional().describe('Pagination offset (default 0)'),
        },
        outputSchema: {
            dryRun: z.boolean(),
            summary: z.string(),
            stats: z.object({
                modules: z.number(),
                entriesUpdated: z.number(),
                entriesDeleted: z.number(),
                hits: z.number().optional(),
            }),
            hits: z
                .array(z.object({
                target: z.enum(['entry', 'module']),
                id: z.string().optional(),
                moduleName: z.string().optional(),
                kind: z.string().optional(),
                field: z.string(),
                value: z.string(),
                snippet: z.string(),
            }))
                .optional(),
            changes: z.array(z.object({
                action: z.enum(['update', 'delete']),
                target: z.enum(['entry', 'module']),
                id: z.string(),
                kind: z.string().optional(),
                moduleName: z.string().optional(),
                field: z.string(),
                before: z.unknown().optional(),
                after: z.unknown().optional(),
            })),
            warnings: z.array(z.string()),
            offset: z.number(),
            hasMore: z.boolean(),
        },
    }, async ({ projectId: provided, operations, scope, dryRun, confirm, limit, offset, }) => {
        const projectId = resolveProjectId(provided);
        const result = await runRefactorArchitecture(projectId, {
            operations: operations,
            scope,
            dryRun,
            confirm,
            limit,
            offset,
        });
        const structuredContent = { ...result };
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent,
        };
    });
}
//# sourceMappingURL=tools-refactor.js.map