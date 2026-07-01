import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ArtifactRecord } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ArtifactNotFoundError,
  ArtifactsStorageService,
  InvalidArtifactIdError,
  artifactRecordId,
} from "./artifacts.storage.service";

const record = (over: Partial<ArtifactRecord>): ArtifactRecord => ({
  id: "delivery_1_vault-note_docs-md",
  kind: "vault-note",
  locator: "audit-note",
  from: "docs.md",
  producedBy: { runRef: "delivery_1", pipelineId: "delivery" },
  createdAt: "2026-07-01T10:00:00.000Z",
  ...over,
});

describe("ArtifactsStorageService", () => {
  let dir: string;
  let store: ArtifactsStorageService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "artifacts-store-"));
    store = new ArtifactsStorageService(dir);
    await store.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("record → get round-trips; list is newest-first", async () => {
    await store.record(record({}));
    await store.record(
      record({
        id: "delivery_2_pr_docs-md",
        kind: "pr",
        locator: "https://example.test/pr/2",
        producedBy: { runRef: "delivery_2", pipelineId: "delivery" },
        createdAt: "2026-07-01T11:00:00.000Z",
      }),
    );

    expect((await store.get("delivery_1_vault-note_docs-md")).locator).toBe("audit-note");
    const all = await store.list();
    expect(all.map((r) => r.id)).toEqual([
      "delivery_2_pr_docs-md",
      "delivery_1_vault-note_docs-md",
    ]);
  });

  it("re-recording the same id replaces (idempotent re-delivery), never duplicates", async () => {
    await store.record(record({}));
    await store.record(record({ locator: "audit-note-v2" }));
    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.locator).toBe("audit-note-v2");
  });

  it("filters by projectId and pipelineId", async () => {
    await store.record(
      record({ producedBy: { runRef: "r1", pipelineId: "research", projectId: "acme" } }),
    );
    await store.record(
      record({
        id: "r2_pr_x",
        createdAt: "2026-07-01T12:00:00.000Z",
        producedBy: { runRef: "r2", pipelineId: "delivery", projectId: "beta" },
      }),
    );

    expect(await store.listFiltered({ projectId: "acme" })).toHaveLength(1);
    expect(await store.listFiltered({ pipelineId: "delivery" })).toHaveLength(1);
    expect(await store.listFiltered({ projectId: "acme", pipelineId: "delivery" })).toHaveLength(0);
    expect(await store.listFiltered({})).toHaveLength(2);
  });

  it("a corrupt file is skipped by list and reads as not-found by get", async () => {
    await store.record(record({}));
    await fs.writeFile(path.join(dir, "broken.json"), "{not json", "utf8");

    expect(await store.list()).toHaveLength(1);
    await expect(store.get("broken")).rejects.toBeInstanceOf(ArtifactNotFoundError);
  });

  it("rejects a path-escaping id", async () => {
    await expect(store.get("../evil")).rejects.toBeInstanceOf(InvalidArtifactIdError);
  });

  it("artifactRecordId slugs the handoff name and stays unique per kind", () => {
    expect(artifactRecordId("delivery_1", "vault-note", "Docs Report.md")).toBe(
      "delivery_1_vault-note_docs-report-md",
    );
    expect(artifactRecordId("delivery_1", "pr", "Docs Report.md")).toBe(
      "delivery_1_pr_docs-report-md",
    );
  });
});
