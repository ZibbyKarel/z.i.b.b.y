import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResearchSource } from "@zibby/contracts";
import { FakeResearchAdapter } from "./fake.adapter";

const source: ResearchSource = { id: "hn", kind: "hn", label: "HN", enabled: true };

describe("FakeResearchAdapter", () => {
  let dir: string;
  let adapter: FakeResearchAdapter;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "research-fix-"));
    adapter = new FakeResearchAdapter(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns [] for a missing fixture", async () => {
    expect(await adapter.fetch(source)).toEqual([]);
  });

  it("returns [] for a garbage fixture (never throws)", async () => {
    await fs.writeFile(path.join(dir, "hn.json"), "not json", "utf8");
    expect(await adapter.fetch(source)).toEqual([]);
  });

  it("reads items from <sourceId>.json and skips entries without a title", async () => {
    await fs.writeFile(
      path.join(dir, "hn.json"),
      JSON.stringify([
        { id: "x", title: "Real item", summary: "s", url: "https://e.com" },
        { summary: "no title — dropped" },
      ]),
      "utf8",
    );
    const items = await adapter.fetch(source);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "x",
      title: "Real item",
      summary: "s",
      url: "https://e.com",
    });
  });

  it("synthesizes a stable id when an entry omits one", async () => {
    await fs.writeFile(path.join(dir, "hn.json"), JSON.stringify([{ title: "T" }]), "utf8");
    const items = await adapter.fetch(source);
    expect(items[0]?.id).toBe("hn-0");
  });
});
