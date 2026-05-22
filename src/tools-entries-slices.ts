import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import {
  BUILTIN_SLICES,
  buildSliceResponse,
  clampLimit,
  countEntriesForKinds,
  getBuiltinSlice,
  resolveSliceFilter,
} from "./slices.js";
import {
  deleteEntry,
  deleteSlice,
  filterIndexItems,
  findEntryByKindTitle,
  loadEntries,
  readArchitecture,
  readEntry,
  readEntryIndex,
  readSlice,
  writeEntry,
  writeSlice,
  listSliceIds,
} from "./storage.js";
import { migrateScriptsToEntries } from "./migrate-scripts.js";
import type { Entry, SliceDefinition, SliceFormat } from "./types.js";

const entryRefsSchema = z
  .object({
    moduleName: z
      .string()
      .optional()
      .describe(
        "Module name from list-modules only. Do not paste module description here—link by name."
      ),
    files: z
      .array(z.string())
      .optional()
      .describe("Workspace-relative file paths where this fact lives"),
    entryIds: z
      .array(z.string())
      .optional()
      .describe("Related entry ids, e.g. flow steps pointing to other entries"),
  })
  .optional();

type ProjectIdResolver = (provided?: string) => string;

export function registerEntriesAndSlicesTools(
  server: McpServer,
  resolveProjectId: ProjectIdResolver
): void {
  async function ensureMigrated(projectId: string): Promise<void> {
    await migrateScriptsToEntries(projectId);
  }

  server.registerTool(
    "set-entry",
    {
      title: "Set Entry",
      description:
        "Creates or updates one canonical project fact (entry)—single source of truth for APIs, domain terms, flows, scripts, etc. Use when you discovered a concrete fact while working (endpoint, table, glossary term). Do not use for module structure—use set-module-details. Do not copy module.description into summary; link via refs.moduleName only. Upsert: pass id to update, or omit id to match by kind+title or create new. Example: kind=http-endpoint, title='POST /orders', summary='Creates order', refs.files=['src/OrderController.java'].",
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe(
            "Project id from list-projects if workspace path may differ; defaults to MCP_PROJECT_ID"
          ),
        id: z
          .string()
          .optional()
          .describe("Entry uuid; omit to upsert by kind+title or create new"),
        kind: z
          .string()
          .describe(
            "Free-form type: http-endpoint, glossary, entity, flow, script, godot-scene, etc. Builtin slice list-slices shows recommended kinds per sliceId"
          ),
        title: z
          .string()
          .describe("Short unique label for search, e.g. 'POST /orders' or 'Order'"),
        summary: z
          .string()
          .describe("1-2 sentences; not a module essay—only this fact"),
        payload: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Kind-specific extra fields only, e.g. method/path for APIs, steps for flow"),
        refs: entryRefsSchema,
        tags: z
          .array(z.string())
          .optional()
          .describe("Optional labels for get-slice query filtering"),
      },
      outputSchema: { entryId: z.string(), message: z.string() },
    },
    async (params) => {
      const projectId = resolveProjectId(params.projectId);
      await ensureMigrated(projectId);
      const now = new Date().toISOString();
      let existing: Entry | null = null;

      if (params.id) {
        existing = await readEntry(projectId, params.id);
      } else {
        existing = await findEntryByKindTitle(projectId, params.kind, params.title);
      }

      const entryId = params.id ?? existing?.id ?? uuidv4();
      const entry: Entry = {
        id: entryId,
        kind: params.kind,
        title: params.title,
        summary: params.summary,
        payload: params.payload,
        refs: params.refs,
        tags: params.tags,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      await writeEntry(projectId, entry);

      return {
        content: [{ type: "text", text: `Entry saved: ${entry.title} (${entry.kind})` }],
        structuredContent: {
          entryId,
          message: `Entry '${entry.title}' saved`,
        },
      };
    }
  );

  server.registerTool(
    "get-entry",
    {
      title: "Get Entry",
      description:
        "Returns one full entry by id. Use after list-entries or search-entries when you need payload and refs. Do not use for a full API list—use get-slice sliceId=api. Do not use for module structure—use get-module-details.",
      inputSchema: {
        projectId: z.string().optional().describe("Project id; use list-projects if unsure"),
        id: z.string().describe("Entry id from list-entries or search-entries"),
      },
      outputSchema: { entry: z.any() },
    },
    async ({ projectId: provided, id }) => {
      const projectId = resolveProjectId(provided);
      await ensureMigrated(projectId);
      const entry = await readEntry(projectId, id);

      if (!entry) {
        return {
          content: [{ type: "text", text: `Entry not found: ${id}` }],
          structuredContent: { entry: null },
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(entry, null, 2) }],
        structuredContent: { entry },
      };
    }
  );

  server.registerTool(
    "delete-entry",
    {
      title: "Delete Entry",
      description:
        "Removes one entry and updates the index. Use when a fact is obsolete. Do not use to delete modules—use delete-module. Cannot delete slice definitions—use delete-slice.",
      inputSchema: {
        projectId: z.string().optional().describe("Project id"),
        id: z.string().describe("Entry id to delete"),
      },
      outputSchema: { message: z.string() },
    },
    async ({ projectId: provided, id }) => {
      const projectId = resolveProjectId(provided);
      await deleteEntry(projectId, id);
      return {
        content: [{ type: "text", text: `Entry deleted: ${id}` }],
        structuredContent: { message: `Entry ${id} deleted` },
      };
    }
  );

  server.registerTool(
    "list-entries",
    {
      title: "List Entries",
      description:
        "Returns the entry catalog (id, kind, title, tags)—no payload. Use to browse or pick ids before get-entry. For a typed horizontal view (all APIs, all domain terms) use get-slice instead. On first call, migrates legacy scripts/ folder into entries and deletes scripts/.",
      inputSchema: {
        projectId: z.string().optional().describe("Project id"),
        kind: z.string().optional().describe("Filter by exact kind, e.g. http-endpoint"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Filter entries having any of these tags"),
        query: z
          .string()
          .optional()
          .describe("Case-insensitive substring in title, kind, or tags"),
      },
      outputSchema: { entries: z.array(z.any()), total: z.number() },
    },
    async ({ projectId: provided, kind, tags, query }) => {
      const projectId = resolveProjectId(provided);
      await ensureMigrated(projectId);
      const index = await readEntryIndex(projectId);
      const filtered = filterIndexItems(index.items, {
        kinds: kind ? [kind] : undefined,
        tags,
        query,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: filtered.length, entries: filtered }, null, 2),
          },
        ],
        structuredContent: { entries: filtered, total: filtered.length },
      };
    }
  );

  server.registerTool(
    "search-entries",
    {
      title: "Search Entries",
      description:
        "Search all entries by text in title, summary, kind, and tags; returns compact rows with summary. Use when you know a name (Order, Auth) but not the slice. Prefer get-slice when you know the category (api, domain). Does not search module files on disk.",
      inputSchema: {
        projectId: z.string().optional().describe("Project id"),
        query: z.string().describe("Search text"),
        limit: z
          .number()
          .optional()
          .describe("Max results (default 50, max 200)"),
      },
      outputSchema: { results: z.array(z.any()), total: z.number() },
    },
    async ({ projectId: provided, query, limit }) => {
      const projectId = resolveProjectId(provided);
      await ensureMigrated(projectId);
      const q = query.trim().toLowerCase();
      const entries = (await loadEntries(projectId)).filter((e) =>
        [e.title, e.summary, e.kind, ...(e.tags ?? [])].join(" ").toLowerCase().includes(q)
      );
      const max = clampLimit(limit);
      const slice = entries.slice(0, max);
      const results = slice.map((e) => ({
        id: e.id,
        kind: e.kind,
        title: e.title,
        summary: e.summary,
        tags: e.tags,
        refs: e.refs,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: entries.length, returned: results.length, results }, null, 2),
          },
        ],
        structuredContent: { results, total: entries.length },
      };
    }
  );

  server.registerTool(
    "list-slices",
    {
      title: "List Slices",
      description:
        "Lists built-in and custom slice views (filters over entries—not separate stored data). Use before get-slice to pick sliceId (api, domain, persistence, …). Entry counts come from index only. Custom slices appear after set-slice.",
      inputSchema: {
        projectId: z.string().optional().describe("Project id"),
      },
      outputSchema: { slices: z.array(z.any()) },
    },
    async ({ projectId: provided }) => {
      const projectId = resolveProjectId(provided);
      await ensureMigrated(projectId);
      const index = await readEntryIndex(projectId);
      const customIds = await listSliceIds(projectId);

      const builtins = BUILTIN_SLICES.map((b) => ({
        sliceId: b.id,
        title: b.title,
        description: b.description,
        builtin: true,
        entryCount: countEntriesForKinds(index.items, b.kinds),
        kinds: b.kinds,
      }));

      const custom = await Promise.all(
        customIds.map(async (id) => {
          const def = await readSlice(projectId, id);
          if (!def) return null;
          const kinds = def.filter.kinds ?? [];
          return {
            sliceId: def.id,
            title: def.title,
            description: def.description ?? "",
            builtin: false,
            entryCount: kinds.length
              ? countEntriesForKinds(index.items, kinds)
              : index.items.length,
            kinds,
            tags: def.filter.tags,
          };
        })
      );

      const slices = [...builtins, ...custom.filter(Boolean)];

      return {
        content: [{ type: "text", text: JSON.stringify(slices, null, 2) }],
        structuredContent: { slices },
      };
    }
  );

  const sliceFormatSchema = z
    .enum(["compact", "detail", "table"])
    .optional()
    .describe(
      "compact=minimal list; detail=full entries; table=rows for API-like kinds (method/path columns)"
    );

  server.registerTool(
    "get-slice",
    {
      title: "Get Slice",
      description:
        "Returns a horizontal project view: filtered entries transformed for agents (no duplicate storage). Use for 'all APIs', 'all domain terms', scripts, etc. Call list-slices first to pick sliceId. Do not use get-project-architecture for this. format=compact default; table for api slice. includeModuleContext joins module summary at read time only—never stored in entry.",
      inputSchema: {
        projectId: z.string().optional().describe("Project id"),
        sliceId: z
          .string()
          .describe("Built-in id (api, domain, persistence, …) or custom id from list-slices"),
        query: z
          .string()
          .optional()
          .describe("Further filter by substring in title, summary, kind, tags"),
        format: sliceFormatSchema,
        limit: z.number().optional().describe("Max items (default 50, max 200)"),
        includeModuleContext: z
          .boolean()
          .optional()
          .describe(
            "If true, attach module name+description from architecture when refs.moduleName is set"
          ),
      },
      outputSchema: { slice: z.any() },
    },
    async (params) => {
      const projectId = resolveProjectId(params.projectId);
      await ensureMigrated(projectId);

      const custom = (await readSlice(projectId, params.sliceId)) ?? null;
      const filter = resolveSliceFilter(params.sliceId, custom);

      if (!filter) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown sliceId: ${params.sliceId}. Call list-slices for built-in and custom ids.`,
            },
          ],
          structuredContent: { slice: null },
        };
      }

      const combinedFilter = {
        ...filter,
        query: params.query ?? filter.query,
      };

      const entries = await loadEntries(projectId, combinedFilter);
      const builtin = getBuiltinSlice(params.sliceId);
      const title = custom?.title ?? builtin?.title ?? params.sliceId;
      const format = (params.format ?? "compact") as SliceFormat;
      const architecture = params.includeModuleContext
        ? await readArchitecture(projectId)
        : null;

      const slice = buildSliceResponse(
        params.sliceId,
        title,
        entries,
        {
          format,
          limit: clampLimit(params.limit),
          query: undefined,
          includeModuleContext: params.includeModuleContext,
        },
        architecture
      );

      return {
        content: [{ type: "text", text: JSON.stringify(slice, null, 2) }],
        structuredContent: { slice },
      };
    }
  );

  server.registerTool(
    "set-slice",
    {
      title: "Set Slice",
      description:
        "Saves a custom slice definition (filter only—no items). Items always live in entries. Use when built-in slices (api, domain, …) are not enough, e.g. filter kinds godot-scene + tag gameplay. Do not store duplicate entry text here. get-slice reads entries through this filter.",
      inputSchema: {
        projectId: z.string().optional().describe("Project id"),
        id: z
          .string()
          .describe("Custom slice id (avoid colliding with built-in: api, domain, persistence, …)"),
        title: z.string().describe("Human-readable slice name"),
        description: z.string().optional().describe("When an agent should use this slice"),
        kinds: z
          .array(z.string())
          .optional()
          .describe("Include entries with any of these kind values"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Include entries having any of these tags"),
      },
      outputSchema: { sliceId: z.string(), message: z.string() },
    },
    async (params) => {
      const projectId = resolveProjectId(params.projectId);
      if (getBuiltinSlice(params.id)) {
        return {
          content: [
            {
              type: "text",
              text: `Cannot override built-in slice id: ${params.id}`,
            },
          ],
          structuredContent: {
            sliceId: params.id,
            message: "Built-in slice ids are reserved",
          },
        };
      }

      const now = new Date().toISOString();
      const existing = await readSlice(projectId, params.id);
      const slice: SliceDefinition = {
        id: params.id,
        title: params.title,
        description: params.description,
        filter: {
          kinds: params.kinds,
          tags: params.tags,
        },
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      await writeSlice(projectId, slice);

      return {
        content: [{ type: "text", text: `Slice saved: ${slice.id}` }],
        structuredContent: {
          sliceId: slice.id,
          message: `Slice '${slice.title}' saved`,
        },
      };
    }
  );

  server.registerTool(
    "delete-slice",
    {
      title: "Delete Slice",
      description:
        "Deletes a custom slice definition only. Built-in slices (api, domain, …) cannot be deleted. Does not delete entries—use delete-entry.",
      inputSchema: {
        projectId: z.string().optional().describe("Project id"),
        sliceId: z.string().describe("Custom slice id from list-slices"),
      },
      outputSchema: { message: z.string() },
    },
    async ({ projectId: provided, sliceId }) => {
      const projectId = resolveProjectId(provided);
      if (getBuiltinSlice(sliceId)) {
        return {
          content: [{ type: "text", text: `Cannot delete built-in slice: ${sliceId}` }],
          structuredContent: { message: "Built-in slices cannot be deleted" },
        };
      }

      await deleteSlice(projectId, sliceId);
      return {
        content: [{ type: "text", text: `Slice deleted: ${sliceId}` }],
        structuredContent: { message: `Slice ${sliceId} deleted` },
      };
    }
  );
}

