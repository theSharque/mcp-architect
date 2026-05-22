function uniqueSorted(arr) {
    return [...new Set(arr)].sort();
}
function edgeSet(flow) {
    const set = new Set();
    if (!flow) {
        return set;
    }
    for (const [from, entry] of Object.entries(flow)) {
        for (const to of entry.dependsOn ?? []) {
            set.add(`${from}->${to}`);
        }
    }
    return set;
}
export function recomputeProvidesTo(dataFlow, moduleNames) {
    const names = new Set(moduleNames);
    const result = {};
    for (const name of moduleNames) {
        const existing = dataFlow[name];
        result[name] = {
            dependsOn: existing?.dependsOn?.length ? [...existing.dependsOn] : undefined,
            dataTransformation: existing?.dataTransformation,
        };
    }
    for (const name of moduleNames) {
        for (const dep of result[name]?.dependsOn ?? []) {
            if (!names.has(dep)) {
                continue;
            }
            if (!result[dep]) {
                result[dep] = {};
            }
            const list = result[dep].providesTo ?? [];
            if (!list.includes(name)) {
                result[dep].providesTo = [...list, name];
            }
        }
    }
    for (const name of moduleNames) {
        const providesTo = result[name]?.providesTo;
        if (providesTo?.length) {
            result[name].providesTo = uniqueSorted(providesTo);
        }
        else if (result[name]) {
            delete result[name].providesTo;
        }
    }
    return result;
}
export function syncModuleDependsOn(dataFlow, moduleName, dependsOn, moduleNames) {
    const updated = { ...dataFlow };
    updated[moduleName] = {
        ...(updated[moduleName] ?? {}),
        dependsOn: uniqueSorted(dependsOn),
    };
    return recomputeProvidesTo(updated, moduleNames);
}
export function buildDataFlowFromModules(modules, moduleDetailsMap) {
    const dataFlow = {};
    for (const mod of modules) {
        const deps = moduleDetailsMap.get(mod.name)?.dependencies ?? [];
        if (deps.length > 0) {
            dataFlow[mod.name] = { dependsOn: uniqueSorted(deps) };
        }
    }
    return recomputeProvidesTo(dataFlow, modules.map((m) => m.name));
}
export function buildDataFlowFromDependsOn(dataFlow, moduleNames) {
    const flow = {};
    for (const name of moduleNames) {
        const dependsOn = dataFlow[name]?.dependsOn;
        if (dependsOn?.length || dataFlow[name]?.dataTransformation) {
            flow[name] = {
                dependsOn: dependsOn?.length ? [...dependsOn] : undefined,
                dataTransformation: dataFlow[name]?.dataTransformation,
            };
        }
    }
    return recomputeProvidesTo(flow, moduleNames);
}
export function pruneDataFlow(dataFlow, validNames) {
    const names = new Set(validNames);
    const pruned = {};
    for (const name of validNames) {
        const flow = dataFlow[name];
        if (!flow) {
            continue;
        }
        const entry = {};
        if (flow.dataTransformation) {
            entry.dataTransformation = flow.dataTransformation;
        }
        const dependsOn = (flow.dependsOn ?? []).filter((d) => names.has(d));
        if (dependsOn.length) {
            entry.dependsOn = dependsOn;
        }
        if (Object.keys(entry).length > 0) {
            pruned[name] = entry;
        }
    }
    return recomputeProvidesTo(pruned, validNames);
}
export function removeModuleFromDataFlow(dataFlow, moduleName) {
    if (!dataFlow) {
        return undefined;
    }
    const updated = { ...dataFlow };
    delete updated[moduleName];
    for (const flow of Object.values(updated)) {
        if (flow.dependsOn) {
            flow.dependsOn = flow.dependsOn.filter((d) => d !== moduleName);
            if (flow.dependsOn.length === 0) {
                delete flow.dependsOn;
            }
        }
        if (flow.providesTo) {
            flow.providesTo = flow.providesTo.filter((p) => p !== moduleName);
            if (flow.providesTo.length === 0) {
                delete flow.providesTo;
            }
        }
    }
    return Object.keys(updated).length > 0 ? updated : undefined;
}
export function mergeModules(existing, incoming, options) {
    if (options.replace || !existing) {
        return incoming;
    }
    const byName = new Map(existing.map((m) => [m.name, m]));
    for (const mod of incoming) {
        byName.set(mod.name, mod);
    }
    return [...byName.values()];
}
export function mergeDataFlow(existing, incoming, options) {
    if (options.replace) {
        return incoming;
    }
    if (!incoming) {
        return existing;
    }
    if (!existing) {
        return { ...incoming };
    }
    const merged = { ...existing };
    for (const [name, flow] of Object.entries(incoming)) {
        merged[name] = { ...(merged[name] ?? {}), ...flow };
    }
    return merged;
}
export function validateDataFlow(architecture, moduleDetailsMap, options = {}) {
    const checkInverse = options.checkInverse ?? true;
    const checkModuleDeps = options.checkModuleDeps ?? true;
    const issues = [];
    const moduleNames = new Set(architecture.modules.map((m) => m.name));
    const dataFlow = architecture.dataFlow ?? {};
    for (const [moduleName, flow] of Object.entries(dataFlow)) {
        if (!moduleNames.has(moduleName)) {
            issues.push({
                kind: "orphan-flow-key",
                module: moduleName,
                detail: "dataFlow entry for non-existent module",
            });
        }
        for (const dep of flow.dependsOn ?? []) {
            if (!moduleNames.has(dep)) {
                issues.push({
                    kind: "dangling-depends-on",
                    module: moduleName,
                    detail: `depends on missing module '${dep}'`,
                });
            }
        }
        for (const target of flow.providesTo ?? []) {
            if (!moduleNames.has(target)) {
                issues.push({
                    kind: "dangling-provides-to",
                    module: moduleName,
                    detail: `provides to missing module '${target}'`,
                });
            }
        }
    }
    if (checkInverse) {
        const expected = recomputeProvidesTo(dataFlow, [...moduleNames]);
        for (const name of moduleNames) {
            const actual = uniqueSorted(dataFlow[name]?.providesTo ?? []);
            const exp = uniqueSorted(expected[name]?.providesTo ?? []);
            if (actual.join(",") !== exp.join(",")) {
                issues.push({
                    kind: "inverse-drift",
                    module: name,
                    detail: `providesTo [${actual.join(", ")}] != expected [${exp.join(", ")}]`,
                });
            }
        }
    }
    if (checkModuleDeps) {
        for (const mod of architecture.modules) {
            const details = moduleDetailsMap.get(mod.name);
            const flowDeps = uniqueSorted(dataFlow[mod.name]?.dependsOn ?? []);
            const fileDeps = uniqueSorted(details?.dependencies ?? []);
            if (flowDeps.join(",") !== fileDeps.join(",")) {
                issues.push({
                    kind: "deps-mismatch",
                    module: mod.name,
                    detail: `dataFlow.dependsOn [${flowDeps.join(", ")}] != module.dependencies [${fileDeps.join(", ")}]`,
                });
            }
        }
    }
    return issues;
}
export function diffFlowEdges(before, after) {
    const beforeSet = edgeSet(before);
    const afterSet = edgeSet(after);
    let edgesAdded = 0;
    let edgesRemoved = 0;
    for (const edge of afterSet) {
        if (!beforeSet.has(edge)) {
            edgesAdded++;
        }
    }
    for (const edge of beforeSet) {
        if (!afterSet.has(edge)) {
            edgesRemoved++;
        }
    }
    return { edgesAdded, edgesRemoved };
}
//# sourceMappingURL=data-flow.js.map