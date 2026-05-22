import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDataFlowFromModules,
  diffFlowEdges,
  mergeDataFlow,
  mergeModules,
  pruneDataFlow,
  recomputeProvidesTo,
  removeModuleFromDataFlow,
  syncModuleDependsOn,
  validateDataFlow,
} from "./data-flow.js";
import type { ModuleDetails, ModuleSummary, ProjectArchitecture } from "./types.js";

describe("recomputeProvidesTo", () => {
  it("derives providesTo from dependsOn", () => {
    const flow = recomputeProvidesTo(
      {
        api: { dependsOn: ["storage"] },
        storage: {},
      },
      ["api", "storage"]
    );

    assert.deepEqual(flow.api?.dependsOn, ["storage"]);
    assert.deepEqual(flow.storage?.providesTo, ["api"]);
  });
});

describe("syncModuleDependsOn", () => {
  it("updates one module and recomputes inverse", () => {
    const flow = syncModuleDependsOn({}, "b", ["a"], ["a", "b"]);
    assert.deepEqual(flow.b?.dependsOn, ["a"]);
    assert.deepEqual(flow.a?.providesTo, ["b"]);
  });
});

describe("mergeModules", () => {
  it("upserts by name when not replacing", () => {
    const existing: ModuleSummary[] = [
      {
        id: "1",
        name: "a",
        description: "old",
        createdAt: "t",
        updatedAt: "t",
      },
    ];
    const incoming: ModuleSummary[] = [
      {
        id: "1",
        name: "a",
        description: "new",
        createdAt: "t",
        updatedAt: "t2",
      },
      {
        id: "2",
        name: "b",
        description: "b",
        createdAt: "t",
        updatedAt: "t",
      },
    ];
    const merged = mergeModules(existing, incoming, { replace: false });
    assert.equal(merged.length, 2);
    assert.equal(merged.find((m) => m.name === "a")?.description, "new");
  });
});

describe("mergeDataFlow", () => {
  it("preserves existing flow when incoming is omitted", () => {
    const existing = { a: { dependsOn: ["b"] } };
    assert.deepEqual(mergeDataFlow(existing, undefined, { replace: false }), existing);
  });

  it("merges by module name", () => {
    const merged = mergeDataFlow(
      { a: { dependsOn: ["b"], dataTransformation: "x" } },
      { a: { dependsOn: ["c"] } },
      { replace: false }
    );
    assert.deepEqual(merged?.a?.dependsOn, ["c"]);
    assert.equal(merged?.a?.dataTransformation, "x");
  });
});

describe("removeModuleFromDataFlow", () => {
  it("removes module and dangling references", () => {
    const updated = removeModuleFromDataFlow(
      {
        a: { dependsOn: ["b"], providesTo: ["c"] },
        b: { providesTo: ["a"] },
        c: { dependsOn: ["a"] },
      },
      "a"
    );

    assert.equal(updated?.a, undefined);
    assert.deepEqual(updated?.b?.providesTo, undefined);
    assert.deepEqual(updated?.c?.dependsOn, undefined);
  });
});

describe("buildDataFlowFromModules", () => {
  it("builds dependsOn from module dependencies", () => {
    const modules: ModuleSummary[] = [
      { id: "1", name: "api", description: "", createdAt: "t", updatedAt: "t" },
      { id: "2", name: "storage", description: "", createdAt: "t", updatedAt: "t" },
    ];
    const details = new Map<string, ModuleDetails>([
      [
        "api",
        {
          moduleId: "1",
          name: "api",
          description: "",
          inputs: "",
          outputs: "",
          dependencies: ["storage"],
          createdAt: "t",
          updatedAt: "t",
        },
      ],
    ]);

    const flow = buildDataFlowFromModules(modules, details);
    assert.deepEqual(flow.api?.dependsOn, ["storage"]);
    assert.deepEqual(flow.storage?.providesTo, ["api"]);
  });
});

describe("validateDataFlow", () => {
  it("detects inverse drift", () => {
    const architecture: ProjectArchitecture = {
      projectId: "p",
      description: "",
      modules: [
        { id: "1", name: "a", description: "", createdAt: "t", updatedAt: "t" },
        { id: "2", name: "b", description: "", createdAt: "t", updatedAt: "t" },
      ],
      dataFlow: {
        a: { dependsOn: ["b"] },
        b: { providesTo: [] },
      },
      createdAt: "t",
      updatedAt: "t",
    };

    const issues = validateDataFlow(architecture, new Map(), {
      checkInverse: true,
      checkModuleDeps: false,
    });
    assert.ok(issues.some((i) => i.kind === "inverse-drift"));
  });
});

describe("diffFlowEdges", () => {
  it("counts added and removed edges", () => {
    const diff = diffFlowEdges(
      { a: { dependsOn: ["b"] } },
      { a: { dependsOn: ["c"] } }
    );
    assert.equal(diff.edgesAdded, 1);
    assert.equal(diff.edgesRemoved, 1);
  });
});

describe("pruneDataFlow", () => {
  it("drops references to unknown modules", () => {
    const pruned = pruneDataFlow(
      { a: { dependsOn: ["b", "missing"] } },
      ["a"]
    );
    assert.deepEqual(pruned.a?.dependsOn, undefined);
  });
});
