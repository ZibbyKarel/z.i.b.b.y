import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GateRulesStorageService } from "../gate-rules/gate-rules.storage.service";
import { PolicyStorageService } from "./policy.storage.service";

/**
 * The floor bucket is the untagged half of the gate-rules list (system rules + the
 * operator's own); a legacy `POLICY.md`'s operator `decisions` migrate into it once.
 */
describe("PolicyStorageService", () => {
  let dir: string;
  let catalog: GateRulesStorageService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "policy-storage-"));
    catalog = new GateRulesStorageService(dir);
    await catalog.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const decisionFor = (rules: { id: string; decision: string }[], id: string) =>
    rules.find((r) => r.id === id)?.decision;

  it("serves the system rules as locked floor rules with their defaults", async () => {
    const floor = await new PolicyStorageService(catalog).floor();
    expect(decisionFor(floor, "floor-purchase")).toBe("ask");
    expect(decisionFor(floor, "floor-pr.merge")).toBe("deny");
    expect(decisionFor(floor, "floor-deploy")).toBe("ask");
    expect(decisionFor(floor, "floor-operator.question")).toBe("ask");
    expect(decisionFor(floor, "floor-agent.delegate")).toBe("notify");
    expect(decisionFor(floor, "floor-pr.open")).toBe("notify");
    expect(floor.every((r) => r.locked && r.source === "system")).toBe(true);
  });

  it("includes the operator's untagged rules, but not department-tagged ones", async () => {
    const global = await catalog.create({
      match: [{ type: "action", action: "tweet" }],
      decision: "deny",
    });
    const dept = await catalog.create({
      match: [{ type: "action", action: "tweet" }],
      decision: "deny",
      department: "dev",
    });
    const ids = (await new PolicyStorageService(catalog).floor()).map((r) => r.id);
    expect(ids).toContain(global.id);
    expect(ids).not.toContain(dept.id);
  });

  it("reflects a system rule the operator moved to allow", async () => {
    const rule = (await catalog.list()).find((r) => r.id === "floor-git.push")!;
    await catalog.update(rule.id, { match: rule.match, decision: "allow" });
    const floor = await new PolicyStorageService(catalog).floor();
    expect(floor.find((r) => r.id === "floor-git.push")).toMatchObject({ decision: "allow" });
    expect(floor.find((r) => r.id === "floor-git.push")?.resolve).toBeUndefined();
  });

  it("migrates a legacy POLICY.md's decisions once, then renames the file", async () => {
    const file = path.join(dir, "POLICY.md");
    await fs.writeFile(
      file,
      "---\npolicy: []\ndecisions:\n  floor-delete: notify\n  floor-pr.merge: ask\n  nope: allow\n---\n",
      "utf8",
    );
    await new PolicyStorageService(catalog, dir).onModuleInit();

    const floor = await new PolicyStorageService(catalog).floor();
    expect(decisionFor(floor, "floor-delete")).toBe("notify");
    expect(floor.find((r) => r.id === "floor-pr.merge")).toMatchObject({
      decision: "ask",
      resolve: { type: "human" },
    });
    await expect(fs.access(file)).rejects.toThrow();
    await expect(fs.access(`${file}.migrated`)).resolves.toBeUndefined();
  });
});
