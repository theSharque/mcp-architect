import type {
  BuiltinSliceInfo,
  CompactEntryRow,
  Entry,
  EntryFilter,
  ModuleSummary,
  ProjectArchitecture,
  SliceBuildOptions,
  SliceDefinition,
  SliceFormat,
  SliceResponse,
} from './types.js';

export const BUILTIN_SLICES: BuiltinSliceInfo[] = [
  {
    id: 'api',
    title: 'API and entry points',
    description: 'HTTP, gRPC, GraphQL, WebSocket, MCP tools/resources, CLI commands',
    kinds: [
      'http-endpoint',
      'grpc-method',
      'graphql-field',
      'websocket-route',
      'mcp-tool',
      'mcp-resource',
      'cli-command',
    ],
  },
  {
    id: 'persistence',
    title: 'Persistence',
    description: 'Tables, entities, repositories, migrations',
    kinds: ['db-table', 'entity', 'repository', 'migration'],
  },
  {
    id: 'events',
    title: 'Events and messaging',
    description: 'Events, topics, queues, messages',
    kinds: ['event', 'topic', 'queue', 'message'],
  },
  {
    id: 'domain',
    title: 'Domain language',
    description: 'Glossary, invariants, lifecycles',
    kinds: ['glossary', 'invariant', 'lifecycle'],
  },
  {
    id: 'flows',
    title: 'Flows and scenarios',
    description: 'End-to-end flows with steps in payload',
    kinds: ['flow'],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'External systems and APIs',
    kinds: ['integration', 'external-api'],
  },
  {
    id: 'config',
    title: 'Configuration',
    description: 'Environment variables, feature flags, config keys',
    kinds: ['env-var', 'feature-flag', 'config-key'],
  },
  {
    id: 'runtime',
    title: 'Runtime',
    description: 'Services, entrypoints, scheduled jobs',
    kinds: ['service', 'entrypoint', 'job'],
  },
  {
    id: 'decisions',
    title: 'Decisions and constraints',
    description: 'ADRs and architectural constraints',
    kinds: ['adr', 'constraint'],
  },
  {
    id: 'scripts',
    title: 'Scripts and commands',
    description: 'Build, test, deploy commands (kind=script)',
    kinds: ['script'],
  },
];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function getBuiltinSlice(sliceId: string): BuiltinSliceInfo | undefined {
  return BUILTIN_SLICES.find((s) => s.id === sliceId);
}

export function resolveSliceFilter(
  sliceId: string,
  customSlice: SliceDefinition | null
): EntryFilter | null {
  const builtin = getBuiltinSlice(sliceId);
  if (builtin) {
    return { kinds: builtin.kinds };
  }
  if (customSlice && customSlice.id === sliceId) {
    return {
      kinds: customSlice.filter.kinds,
      tags: customSlice.filter.tags,
    };
  }
  return null;
}

export function matchesEntryFilter(entry: Entry, filter: EntryFilter): boolean {
  if (filter.kinds?.length && !filter.kinds.includes(entry.kind)) {
    return false;
  }
  if (filter.tags?.length) {
    const entryTags = entry.tags ?? [];
    if (!filter.tags.some((t) => entryTags.includes(t))) {
      return false;
    }
  }
  if (filter.query) {
    const q = filter.query.trim().toLowerCase();
    const haystack = [
      entry.title,
      entry.summary,
      entry.kind,
      ...(entry.tags ?? []),
    ]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) {
      return false;
    }
  }
  return true;
}

function attachModuleContext(
  row: CompactEntryRow,
  architecture: ProjectArchitecture | null
): CompactEntryRow {
  const moduleName = row.refs?.moduleName;
  if (!moduleName || !architecture) {
    return row;
  }
  const mod = architecture.modules.find((m) => m.name === moduleName);
  if (!mod) {
    return row;
  }
  return {
    ...row,
    moduleContext: { name: mod.name, description: mod.description },
  };
}

function toCompactRow(entry: Entry): CompactEntryRow {
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    summary: entry.summary,
    refs: entry.refs?.files || entry.refs?.moduleName ? entry.refs : undefined,
  };
}

function entryToTableRow(entry: Entry): Record<string, unknown> {
  const payload = entry.payload ?? {};
  const apiKinds = new Set([
    'http-endpoint',
    'grpc-method',
    'graphql-field',
    'websocket-route',
    'mcp-tool',
    'mcp-resource',
    'cli-command',
  ]);

  if (apiKinds.has(entry.kind)) {
    return {
      id: entry.id,
      kind: entry.kind,
      method: payload.method ?? '',
      path: payload.path ?? entry.title,
      summary: entry.summary,
      files: entry.refs?.files ?? [],
      moduleName: entry.refs?.moduleName ?? '',
    };
  }

  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    summary: entry.summary,
    files: entry.refs?.files ?? [],
    moduleName: entry.refs?.moduleName ?? '',
  };
}

export function clampLimit(limit?: number): number {
  if (limit === undefined || limit < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(limit, MAX_LIMIT);
}

export function clampOffset(offset?: number): number {
  if (offset === undefined || offset < 0) {
    return 0;
  }
  return Math.floor(offset);
}

export function buildSliceResponse(
  sliceId: string,
  sliceTitle: string,
  entries: Entry[],
  options: SliceBuildOptions,
  architecture: ProjectArchitecture | null
): SliceResponse {
  const limit = clampLimit(options.limit);
  const offset = clampOffset(options.offset);
  const filtered = options.query
    ? entries.filter((e) =>
        matchesEntryFilter(e, { query: options.query })
      )
    : entries;

  const sorted = [...filtered].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const slice = sorted.slice(offset, offset + limit);
  const hasMore = offset + slice.length < filtered.length;

  if (options.format === 'detail') {
    const items = options.includeModuleContext
      ? slice.map((entry) => {
          const row = toCompactRow(entry);
          const withCtx = attachModuleContext(row, architecture);
          return {
            ...entry,
            moduleContext: withCtx.moduleContext,
          };
        })
      : slice;

    return {
      sliceId,
      title: sliceTitle,
      format: 'detail',
      total: filtered.length,
      returned: items.length,
      offset,
      hasMore,
      items: items as Entry[],
    };
  }

  if (options.format === 'table') {
    return {
      sliceId,
      title: sliceTitle,
      format: 'table',
      total: filtered.length,
      returned: slice.length,
      offset,
      hasMore,
      items: slice.map(entryToTableRow),
    };
  }

  let items: CompactEntryRow[] = slice.map(toCompactRow);
  if (options.includeModuleContext) {
    items = items.map((row) => attachModuleContext(row, architecture));
  }

  return {
    sliceId,
    title: sliceTitle,
    format: 'compact',
    total: filtered.length,
    returned: items.length,
    offset,
    hasMore,
    items,
  };
}

export function countEntriesForKinds(
  indexItems: { kind: string }[],
  kinds: string[]
): number {
  const kindSet = new Set(kinds);
  return indexItems.filter((i) => kindSet.has(i.kind)).length;
}
