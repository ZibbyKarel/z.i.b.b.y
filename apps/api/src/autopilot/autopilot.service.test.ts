import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Approval } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ApprovalsService } from "../approvals/approvals.service";
import { AutopilotService, autopilotCoversApproval } from "./autopilot.service";

type Covered = Pick<Approval, "kind" | "action" | "suggestedReviewEvent">;

describe("autopilotCoversApproval — the approval allowlist", () => {
  it.each<[Covered, string | undefined, boolean]>([
    [{ kind: "pr-review", action: "github.pr.review" }, undefined, true],
    [
      { kind: "workflow-gate", action: "stage-approval", suggestedReviewEvent: "APPROVE" },
      undefined,
      true,
    ],
    [{ kind: "workflow-gate", action: "stage-approval" }, undefined, false],
    [{ kind: "workflow-gate", action: "spend-past-cap" }, undefined, false],
    [{ kind: "pr-address-comments", action: "github.pr.comment" }, undefined, true],
    [{ kind: "pr-address-comments", action: "git.push" }, "zibby/run-1-x", true],
    [{ kind: "pr-address-comments", action: "git.push" }, "feature/x", false],
    [{ kind: "pr-fix-ci", action: "git.push" }, "zibby/run-1-x", true],
    [{ kind: "pr-fix-ci", action: "git.push" }, "main", false],
    [{ kind: "channel", action: "channel-reply" }, undefined, true],
    [{ kind: "pr-rebase", action: "git.force_push" }, "zibby/run-1-x", false],
    [{ kind: "workflow-output", action: "pr.open" }, undefined, false],
    [{ kind: "task", action: "spend-past-cap" }, undefined, false],
    [{ kind: "jira-issue", action: "jira.create" }, undefined, false],
    [{ kind: "comms-graduation", action: "graduate" }, undefined, false],
  ])("%o on %s → %s", (approval, head, expected) => {
    expect(autopilotCoversApproval(approval, head)).toBe(expected);
  });
});

describe("AutopilotService", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "autopilot-svc-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("is off (and covers nothing) by default and on a malformed file", async () => {
    await fs.writeFile(path.join(dir, "autopilot.json"), "{ nope");
    const svc = new AutopilotService(dir);
    await svc.onModuleInit();
    expect(svc.isOn()).toBe(false);
    expect(svc.coversApproval({ kind: "channel", action: "channel-reply" })).toBe(false);
  });

  it("reports the pending count but never decides a pending approval", async () => {
    const approve = { calls: 0 };
    const approvals = {
      list: async () => [{ id: "a1" }, { id: "a2" }],
      approve: async () => {
        approve.calls++;
      },
    } as unknown as ApprovalsService;
    const svc = new AutopilotService(dir, approvals);
    await svc.onModuleInit();
    expect(await svc.set("full", "operator")).toMatchObject({ level: "full", pendingApprovals: 2 });
    expect(approve.calls).toBe(0);
  });

  it("re-setting the current level is a no-op (no file write)", async () => {
    const svc = new AutopilotService(dir);
    await svc.onModuleInit();
    await svc.set("off", "chat");
    await expect(fs.readFile(path.join(dir, "autopilot.json"), "utf8")).rejects.toThrow();
  });
});
