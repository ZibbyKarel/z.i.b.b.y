import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultCloneRoot } from "../shared/data-dir";
import { MachineConfigStore } from "./machine-config.store";

describe("MachineConfigStore (Phase 76 — per-machine, gitignored config)", () => {
  let dir: string;
  let file: string;
  let store: MachineConfigStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "machine-config-"));
    file = path.join(dir, "config.json");
    store = new MachineConfigStore(file);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads the computed default cloneRoot when the file is absent", async () => {
    const config = await store.read();
    expect(config).toEqual({ cloneRoot: defaultCloneRoot() });
  });

  it("reads the default when the file contains garbage JSON", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "not json", "utf8");
    expect(await store.read()).toEqual({ cloneRoot: defaultCloneRoot() });
  });

  it("reads the default when the file fails schema validation", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ cloneRoot: "" }), "utf8");
    expect(await store.read()).toEqual({ cloneRoot: defaultCloneRoot() });
  });

  it("write→read round-trips a patched cloneRoot", async () => {
    const written = await store.write({ cloneRoot: "/Users/op/Projects" });
    expect(written).toEqual({ cloneRoot: "/Users/op/Projects" });
    expect(await store.read()).toEqual({ cloneRoot: "/Users/op/Projects" });
  });

  it("write creates the parent directory and persists atomically (no leftover .tmp file)", async () => {
    await store.write({ cloneRoot: "/tmp/clones" });
    const entries = await fs.readdir(dir);
    expect(entries).toEqual(["config.json"]);
    const raw = await fs.readFile(file, "utf8");
    expect(JSON.parse(raw)).toEqual({ cloneRoot: "/tmp/clones" });
  });

  it("write merges a patch over the current config rather than replacing wholesale", async () => {
    await store.write({ cloneRoot: "/first" });
    // An empty patch is a no-op merge — the current value survives.
    const merged = await store.write({});
    expect(merged).toEqual({ cloneRoot: "/first" });
  });
});
