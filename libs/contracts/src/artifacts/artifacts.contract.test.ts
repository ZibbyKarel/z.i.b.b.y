import { describe, expect, it } from "vitest";
import { ArtifactListQuerySchema, ArtifactRecordSchema } from "./artifact.schema";
import { artifactsContract } from "./artifacts.contract";

const VALID = {
  id: "delivery_1_vault-note_docs-md",
  kind: "vault-note",
  locator: "audit-note",
  from: "docs.md",
  producedBy: { runRef: "delivery_1", pipelineId: "delivery" },
  createdAt: "2026-07-01T10:00:00.000Z",
};

describe("artifact.schema", () => {
  it("accepts a full record (round-trip) and optional producer refs", () => {
    expect(ArtifactRecordSchema.parse(VALID)).toEqual(VALID);
    const withRefs = {
      ...VALID,
      producedBy: { ...VALID.producedBy, taskId: "task_1", projectId: "acme" },
    };
    expect(ArtifactRecordSchema.parse(withRefs)).toEqual(withRefs);
  });

  it("rejects an unknown kind, an empty locator and a non-datetime createdAt", () => {
    expect(ArtifactRecordSchema.safeParse({ ...VALID, kind: "blob" }).success).toBe(false);
    expect(ArtifactRecordSchema.safeParse({ ...VALID, locator: "" }).success).toBe(false);
    expect(ArtifactRecordSchema.safeParse({ ...VALID, createdAt: "yesterday" }).success).toBe(
      false,
    );
  });

  it("list query: both filters optional, empty strings rejected", () => {
    expect(ArtifactListQuerySchema.parse({})).toEqual({});
    expect(ArtifactListQuerySchema.parse({ projectId: "acme" })).toEqual({ projectId: "acme" });
    expect(ArtifactListQuerySchema.safeParse({ pipelineId: "" }).success).toBe(false);
  });
});

describe("artifactsContract", () => {
  it("is read-only under /api/artifacts (records are born only inside the API)", () => {
    expect(artifactsContract.listArtifacts.method).toBe("GET");
    expect(artifactsContract.listArtifacts.path).toBe("/api/artifacts");
    expect(artifactsContract.getArtifact.method).toBe("GET");
    expect(artifactsContract.getArtifact.path).toBe("/api/artifacts/:id");
    // No mutation endpoints exist on the router.
    expect(Object.keys(artifactsContract)).toEqual(["listArtifacts", "getArtifact"]);
  });
});
