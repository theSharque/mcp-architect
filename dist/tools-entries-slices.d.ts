import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
export declare const moduleFactSchema: z.ZodObject<{
    kind: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    refs: z.ZodOptional<z.ZodObject<{
        moduleName: z.ZodOptional<z.ZodString>;
        files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        entryIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        moduleName?: string | undefined;
        files?: string[] | undefined;
        entryIds?: string[] | undefined;
    }, {
        moduleName?: string | undefined;
        files?: string[] | undefined;
        entryIds?: string[] | undefined;
    }>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    kind: string;
    title: string;
    summary: string;
    tags?: string[] | undefined;
    payload?: Record<string, unknown> | undefined;
    refs?: {
        moduleName?: string | undefined;
        files?: string[] | undefined;
        entryIds?: string[] | undefined;
    } | undefined;
}, {
    kind: string;
    title: string;
    summary: string;
    tags?: string[] | undefined;
    payload?: Record<string, unknown> | undefined;
    refs?: {
        moduleName?: string | undefined;
        files?: string[] | undefined;
        entryIds?: string[] | undefined;
    } | undefined;
}>;
type ProjectIdResolver = (provided?: string) => string;
export declare function registerEntriesAndSlicesTools(server: McpServer, resolveProjectId: ProjectIdResolver): void;
export {};
//# sourceMappingURL=tools-entries-slices.d.ts.map