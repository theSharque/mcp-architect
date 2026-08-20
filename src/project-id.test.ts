import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROJECT_ID_MISSING_ERROR,
  isForbiddenProjectId,
  resolveProjectId,
} from "./project-id.js";

describe("isForbiddenProjectId", () => {
  it("rejects default-project regardless of case", () => {
    assert.equal(isForbiddenProjectId("default-project"), true);
    assert.equal(isForbiddenProjectId("Default-Project"), true);
  });

  it("rejects unsubstituted workspaceFolder artifacts", () => {
    assert.equal(isForbiddenProjectId("__workspaceFolder_"), true);
    assert.equal(isForbiddenProjectId("${workspaceFolder}"), true);
  });

  it("rejects blank ids", () => {
    assert.equal(isForbiddenProjectId(""), true);
    assert.equal(isForbiddenProjectId("   "), true);
  });

  it("allows real project ids", () => {
    assert.equal(isForbiddenProjectId("_qs_mcp-architector"), false);
    assert.equal(isForbiddenProjectId("_qs_spectrum"), false);
  });
});

describe("resolveProjectId", () => {
  it("requires an explicit project id", () => {
    assert.throws(() => resolveProjectId(), { message: PROJECT_ID_MISSING_ERROR });
    assert.throws(() => resolveProjectId(""), { message: PROJECT_ID_MISSING_ERROR });
    assert.throws(() => resolveProjectId("  "), { message: PROJECT_ID_MISSING_ERROR });
  });

  it("rejects the default-project dump", () => {
    assert.throws(() => resolveProjectId("default-project"), /forbidden/);
  });

  it("returns a trimmed explicit id", () => {
    assert.equal(resolveProjectId("  _qs_spectrum  "), "_qs_spectrum");
  });
});
