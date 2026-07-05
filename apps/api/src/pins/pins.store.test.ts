import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PinsStore } from "./pins.store";

describe("PinsStore", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "pins-store-"));
    file = path.join(dir, "pins.json");
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads an empty list when the file is missing", async () => {
    const store = new PinsStore(file);
    expect(await store.read()).toEqual([]);
  });

  it("write persists atomically and a fresh store reads it back", async () => {
    const store = new PinsStore(file);
    await store.write([
      { kind: "agent", id: "researcher" },
      { kind: "pipeline", id: "delivery" },
    ]);
    expect(await store.read()).toEqual([
      { kind: "agent", id: "researcher" },
      { kind: "pipeline", id: "delivery" },
    ]);
    // A fresh store over the same file sees the persisted pins (restart survival).
    expect(await new PinsStore(file).read()).toEqual([
      { kind: "agent", id: "researcher" },
      { kind: "pipeline", id: "delivery" },
    ]);
  });

  it("dedupes by (kind, id) on write — last occurrence wins", async () => {
    const store = new PinsStore(file);
    await store.write([
      { kind: "agent", id: "researcher" },
      { kind: "chain", id: "research-then-build" },
      { kind: "agent", id: "researcher" },
    ]);
    const pins = await store.read();
    expect(pins).toHaveLength(2);
    expect(pins.filter((p) => p.kind === "agent" && p.id === "researcher")).toHaveLength(1);
  });

  it("falls back to an empty list on a garbage file at start", async () => {
    await fs.writeFile(file, "{ not json");
    const store = new PinsStore(file);
    expect(await store.read()).toEqual([]);
  });
});
