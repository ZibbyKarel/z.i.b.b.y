import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QuickActionsStore } from "./quick-actions.store";

describe("QuickActionsStore", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "quick-actions-store-"));
    file = path.join(dir, "quick-actions.json");
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads an empty list when the file is missing", async () => {
    expect(await new QuickActionsStore(file).read()).toEqual([]);
  });

  it("falls back to an empty list on a corrupt file", async () => {
    await fs.writeFile(file, "{ not json");
    expect(await new QuickActionsStore(file).read()).toEqual([]);
  });

  it("round-trips through a fresh store", async () => {
    const actions = [
      { id: "a", label: "Deploy", text: "Run deploy" },
      {
        id: "b",
        label: "Review",
        text: "Review PRs",
        target: { kind: "agent" as const, id: "coder", name: "Kodér" },
      },
    ];
    await new QuickActionsStore(file).write(actions);
    expect(await new QuickActionsStore(file).read()).toEqual(actions);
  });

  it("dedupes by id — last occurrence's value wins (Map semantics)", async () => {
    const store = new QuickActionsStore(file);
    await store.write([
      { id: "a", label: "First", text: "one" },
      { id: "b", label: "Other", text: "two" },
      { id: "a", label: "Second", text: "three" },
    ]);
    expect(await store.read()).toEqual([
      { id: "a", label: "Second", text: "three" },
      { id: "b", label: "Other", text: "two" },
    ]);
  });
});
