import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type ProjectIdResolver } from "./project-id.js";
export declare const moduleFactSchema: z.ZodObject<{
    kind: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    refs: z.ZodOptional<z.ZodObject<{
        moduleName: z.ZodOptional<z.ZodString>;
        files: z.ZodOptional<z.ZodArray<z.ZodString>>;
        entryIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare function registerEntriesAndSlicesTools(server: McpServer, resolveProjectId: ProjectIdResolver): void;
//# sourceMappingURL=tools-entries-slices.d.ts.map