import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ActivityEntry, IntendedAction } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActivityLogService } from "../activity/activity-log.service";
import { AutopilotService } from "../autopilot/autopilot.service";
import { GateRulesStorageService } from "../gate-rules/gate-rules.storage.service";
import { GateEvaluatorService } from "./gate-evaluator.service";
import { PolicyStorageService } from "./policy.storage.service";

/** Phase 4 — the autopilot overlay in the gate evaluator. */
describe("GateEvaluatorService — autopilot overlay", () => {
  let dir: string;
  let catalog: GateRulesStorageService;
  let policy: PolicyStorageService;
  let autopilot: AutopilotService;
  let evaluator: GateEvaluatorService;
  let recorded: Pick<ActivityEntry, "kind" | "summary" | "refs">[];

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "autopilot-gate-"));
    catalog = new GateRulesStorageService(dir);
    policy = new PolicyStorageService(catalog);
    await catalog.onModuleInit();
    recorded = [];
    const activity = {
      record: async (e: Pick<ActivityEntry, "kind" | "summary" | "refs">) => {
        recorded.push(e);
      },
    } as unknown as ActivityLogService;
    autopilot = new AutopilotService(dir, undefined, activity);
    await autopilot.onModuleInit();
    evaluator = new GateEvaluatorService(
      policy,
      undefined,
      activity,
      catalog,
      undefined,
      autopilot,
    );
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const evalFloor = async (
    action: IntendedAction,
    own: Parameters<typeof evaluator.ownRules>[0] = {},
  ) => evaluator.evaluate(await evaluator.rulesForAgent(own), action);

  const covered: IntendedAction[] = [
    { action: "gh.pr_comment" },
    { action: "git.push", branch: "zibby/run-1-fix" },
  ];
  const untouched: IntendedAction[] = [
    { action: "pr.merge" },
    { action: "deploy" },
    { action: "payment" },
    { action: "purchase" },
    { action: "spend-past-cap" },
    { action: "delete" },
    { action: "git.force_push", branch: "zibby/run-1-fix" },
    { action: "gh.api_write" },
    { action: "send_email" },
    { action: "operator.question" },
    { action: "git.push", branch: "main" },
    { action: "git.push", branch: "feature/x" },
    { action: "git.push" },
    { action: "git.push", branch: "zibby/" },
  ];

  it("off: covered actions still ask", async () => {
    for (const a of covered) expect((await evalFloor(a)).decision).toBe("ask");
  });

  it("full: covered asks resolve as act-then-report, marked and recorded", async () => {
    await autopilot.set("full", "operator");
    for (const a of covered) {
      expect(await evalFloor(a)).toMatchObject({ decision: "notify", via: "autopilot" });
    }
    expect(recorded.filter((e) => e.kind === "autopilot-action")).toHaveLength(2);
    expect(recorded.find((e) => e.kind === "autopilot-changed")?.refs).toMatchObject({
      status: "full",
      decision: "operator",
    });
  });

  it("full: a deny / Never rule and every non-covered ask are not loosened", async () => {
    const before = await Promise.all(untouched.map((a) => evalFloor(a)));
    await autopilot.set("full", "operator");
    const after = await Promise.all(untouched.map((a) => evalFloor(a)));
    expect(after).toEqual(before);
    expect(after.find((_, i) => untouched[i]?.action === "pr.merge")?.decision).toBe("deny");
    expect(after.every((e) => e.via === undefined)).toBe(true);
  });

  it("another matching global ask on the same push still wins (strictest global)", async () => {
    await catalog.create({
      name: "Push zibby/x",
      match: [{ type: "action", action: "git.push", branch: "zibby/run-1-fix" }],
      decision: "ask",
      resolve: { type: "human" },
    });
    await autopilot.set("full", "operator");
    expect((await evalFloor({ action: "git.push", branch: "zibby/run-1-fix" })).decision).toBe(
      "ask",
    );
  });

  it("an agent's own ask / deny / legacy requires_approval still wins", async () => {
    await autopilot.set("full", "operator");
    const action = { action: "gh.pr_comment" };
    const ask = {
      gates: [
        {
          match: [{ type: "action" as const, action: "gh.pr_comment" }],
          decision: "ask" as const,
          resolve: { type: "human" as const },
        },
      ],
    };
    const deny = {
      gates: [
        {
          match: [{ type: "action" as const, action: "gh.pr_comment" }],
          decision: "deny" as const,
        },
      ],
    };
    expect((await evalFloor(action, ask)).decision).toBe("ask");
    expect((await evalFloor(action, deny)).decision).toBe("deny");
    expect((await evalFloor(action, { requires_approval: true })).decision).toBe("ask");
    // An agent allow doesn't become stricter or weaker: autopilot's notify stands.
    const allow = {
      gates: [
        {
          match: [{ type: "action" as const, action: "gh.pr_comment" }],
          decision: "allow" as const,
        },
      ],
    };
    expect(await evalFloor(action, allow)).toMatchObject({ decision: "notify", via: "autopilot" });
  });

  it("a department's own ask still wins", async () => {
    await catalog.create({
      name: "Dev asks on comments",
      match: [{ type: "action", action: "gh.pr_comment" }],
      decision: "ask",
      resolve: { type: "human" },
      department: "dev",
    });
    await autopilot.set("full", "operator");
    const rules = await evaluator.rulesForAgentInDepartment({}, "dev");
    expect(evaluator.evaluate(rules, { action: "gh.pr_comment" }).decision).toBe("ask");
  });

  it("never rewrites the stored rules; turning off restores the exact previous evaluation", async () => {
    const file = path.join(dir, "gate-rules.json");
    const storedBefore = await fs.readFile(file, "utf8");
    const all = [...covered, ...untouched];
    const before = await Promise.all(all.map((a) => evalFloor(a)));
    await autopilot.set("full", "operator");
    await Promise.all(all.map((a) => evalFloor(a)));
    await autopilot.set("off", "chat");
    expect(await Promise.all(all.map((a) => evalFloor(a)))).toEqual(before);
    expect(await fs.readFile(file, "utf8")).toBe(storedBefore);
  });

  it("an edited system rule match never widens the overlay", async () => {
    const rules = await catalog.list();
    const pr = rules.find((r) => r.id === "floor-gh.pr_comment");
    if (!pr) throw new Error("floor-gh.pr_comment missing");
    await catalog.update(pr.id, {
      name: pr.name,
      match: [{ type: "action", action: "deploy" }],
      decision: "ask",
      resolve: { type: "human" },
    });
    await autopilot.set("full", "operator");
    expect((await evalFloor({ action: "deploy" })).decision).toBe("ask");
  });

  it("persists across a restart from autopilot.json", async () => {
    await autopilot.set("full", "operator");
    const again = new AutopilotService(dir);
    await again.onModuleInit();
    expect(again.isOn()).toBe(true);
    expect(JSON.parse(await fs.readFile(path.join(dir, "autopilot.json"), "utf8"))).toMatchObject({
      level: "full",
      by: "operator",
    });
  });
});
