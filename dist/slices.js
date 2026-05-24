export const BUILTIN_SLICES = [
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
        id: 'ui',
        title: 'UI and views',
        description: 'Thymeleaf templates, UI routes, and view definitions',
        kinds: ['http-endpoint', 'view'],
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
export function getBuiltinSlice(sliceId) {
    return BUILTIN_SLICES.find((s) => s.id === sliceId);
}
export function resolveSliceFilter(sliceId, customSlice) {
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
export function matchesEntryFilter(entry, filter) {
    const kinds = filter.kinds ?? (filter.kind ? [filter.kind] : undefined);
    if (kinds?.length && !kinds.includes(entry.kind)) {
        return false;
    }
    if (filter.moduleName && entry.refs?.moduleName !== filter.moduleName) {
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
function attachModuleContext(row, architecture) {
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
function toCompactRow(entry) {
    return {
        id: entry.id,
        kind: entry.kind,
        title: entry.title,
        summary: entry.summary,
        refs: entry.refs?.files || entry.refs?.moduleName ? entry.refs : undefined,
    };
}
function entryToTableRow(entry) {
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
export function clampLimit(limit) {
    if (limit === undefined || limit < 1) {
        return DEFAULT_LIMIT;
    }
    return Math.min(limit, MAX_LIMIT);
}
export function clampOffset(offset) {
    if (offset === undefined || offset < 0) {
        return 0;
    }
    return Math.floor(offset);
}
export function buildSliceResponse(sliceId, sliceTitle, entries, options, architecture) {
    const limit = clampLimit(options.limit);
    const offset = clampOffset(options.offset);
    const filtered = options.query
        ? entries.filter((e) => matchesEntryFilter(e, { query: options.query }))
        : entries;
    const sorted = [...filtered].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
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
            items: items,
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
    let items = slice.map(toCompactRow);
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
export function countEntriesForKinds(indexItems, kinds) {
    const kindSet = new Set(kinds);
    return indexItems.filter((i) => kindSet.has(i.kind)).length;
}
//# sourceMappingURL=slices.js.map