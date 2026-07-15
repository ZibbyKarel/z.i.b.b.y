import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PolicyStorageService } from "./policy.storage.service";

/**
 * Claim 2 — the policy floor must be an ENFORCED MINIMUM, not a mere
 * empty-fallback: any non-empty disk file was previously returned verbatim as
 * "the floor", however weakened relative to the canonical `DEFAULT_FLOOR`. These
 * tests cover the union-merge fix directly (no dedicated test existed before —
 * the audit's own Medium finding).
 */
describe("PolicyStorageService", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "policy-storage-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function writePolicy(yamlPolicyList: string): Promise<void> {
    const body = `---\npolicy:\n${yamlPolicyList}\n---\n\nSystem policy floor.\n`;
    await fs.writeFile(path.join(dir, "POLICY.md"), body, "utf8");
  }

  function decisionFor(rules: { id: string; decision: string }[], id: string): string | undefined {
    return rules.find((r) => r.id === id)?.decision;
  }

  it("(a) empty/missing file falls back to the canonical DEFAULT_FLOOR", async () => {
    const policy = new PolicyStorageService(dir);
    // No onModuleInit — no seed, no file at all.
    const floor = await policy.floor();
    expect(decisionFor(floor, "floor-purchase")).toBe("ask");
    expect(decisionFor(floor, "floor-pr.merge")).toBe("deny");
    expect(floor.length).toBeGreaterThan(0);
  });

  it("(b) a disk file that drops pr.merge entirely still yields floor-pr.merge: deny in the merge", async () => {
    await writePolicy(
      [
        "  - id: floor-purchase",
        "    source: system",
        "    locked: true",
        "    match:",
        "      - type: action",
        "        action: purchase",
        "    decision: ask",
        "    resolve:",
        "      type: human",
      ].join("\n"),
    );
    const policy = new PolicyStorageService(dir);
    const floor = await policy.floor();
    expect(decisionFor(floor, "floor-pr.merge")).toBe("deny");
  });

  it("(c) a disk file with purchase: allow (weaker than canonical ask) keeps the canonical ask", async () => {
    await writePolicy(
      [
        "  - id: floor-purchase",
        "    source: system",
        "    locked: true",
        "    match:",
        "      - type: action",
        "        action: purchase",
        "    decision: allow",
      ].join("\n"),
    );
    const policy = new PolicyStorageService(dir);
    const floor = await policy.floor();
    expect(decisionFor(floor, "floor-purchase")).toBe("ask");
  });

  it("(d) a disk file that hardens purchase to deny keeps the disk deny (hardening still works)", async () => {
    await writePolicy(
      [
        "  - id: floor-purchase",
        "    source: system",
        "    locked: true",
        "    match:",
        "      - type: action",
        "        action: purchase",
        "    decision: deny",
      ].join("\n"),
    );
    const policy = new PolicyStorageService(dir);
    const floor = await policy.floor();
    expect(decisionFor(floor, "floor-purchase")).toBe("deny");
  });

  it("(e) a disk-only new action is present in the merged floor", async () => {
    await writePolicy(
      [
        "  - id: floor-tweet",
        "    source: system",
        "    locked: true",
        "    match:",
        "      - type: action",
        "        action: tweet",
        "    decision: deny",
      ].join("\n"),
    );
    const policy = new PolicyStorageService(dir);
    const floor = await policy.floor();
    expect(decisionFor(floor, "floor-tweet")).toBe("deny");
    // Canonical entries are still present alongside the addition.
    expect(decisionFor(floor, "floor-pr.merge")).toBe("deny");
  });

  it("self-heals THIS machine's own live-drifted POLICY.md (regression — see docs/audit finding, currently-drifted fixture)", async () => {
    // Verbatim copy of this repo's real .zibby/data/POLICY.md as found during the
    // audit: every ask-floor action except pr.merge/channel-reply had drifted to
    // `allow`, and several floor actions were missing entirely.
    await writePolicy(
      [
        "  - id: floor-purchase",
        "    source: system",
        "    locked: true",
        "    match:",
        "      - type: action",
        "        action: purchase",
        "    decision: allow",
        "    resolve:",
        "      type: human",
        "  - id: floor-payment",
        "    source: system",
        "    locked: true",
        "    match:",
        "      - type: action",
        "        action: payment",
        "    decision: allow",
        "    resolve:",
        "      type: human",
        "  - id: floor-git.force_push",
        "    source: system",
        "    locked: true",
        "    match:",
        "      - type: action",
        "        action: git.force_push",
        "    decision: allow",
        "    resolve:",
        "      type: human",
        "  - id: floor-git.push",
        "    source: system",
        "    locked: true",
        "    match:",
        "      - type: action",
        "        action: git.push",
        "    decision: allow",
        "    resolve:",
        "      type: human",
        "  - id: floor-pr.merge",
        "    source: system",
        "    locked: true",
        "    match:",
        "      - type: action",
        "        action: pr.merge",
        "    decision: deny",
        "  - id: floor-send_email",
        "    source: system",
        "    locked: true",
        "    match:",
        "      - type: action",
        "        action: send_email",
        "    decision: allow",
        "    resolve:",
        "      type: human",
        "  - id: floor-jira.create_issue",
        "    source: system",
        "    locked: true",
        "    match:",
        "      - type: action",
        "        action: jira.create_issue",
        "    decision: allow",
        "    resolve:",
        "      type: human",
        "  - id: floor-spend-past-cap",
        "    source: system",
        "    locked: true",
        "    match:",
        "      - type: action",
        "        action: spend-past-cap",
        "    decision: allow",
        "    resolve:",
        "      type: human",
        "  - id: floor-channel-reply",
        "    source: system",
        "    locked: true",
        "    match:",
        "      - type: action",
        "        action: channel-reply",
        "    decision: notify",
      ].join("\n"),
    );
    const policy = new PolicyStorageService(dir);
    const floor = await policy.floor();

    // Every drifted `allow` self-heals back up to the canonical `ask`.
    for (const action of [
      "floor-purchase",
      "floor-payment",
      "floor-git.force_push",
      "floor-git.push",
      "floor-send_email",
      "floor-jira.create_issue",
      "floor-spend-past-cap",
    ]) {
      expect(decisionFor(floor, action)).toBe("ask");
    }
    // Entries entirely missing from the drifted disk file are filled in.
    expect(decisionFor(floor, "floor-gh.api_write")).toBe("ask");
    expect(decisionFor(floor, "floor-delete")).toBe("ask");
    expect(decisionFor(floor, "floor-agent.propose_new")).toBe("ask");
    expect(decisionFor(floor, "floor-deploy")).toBe("ask");
    // Untouched entries are preserved.
    expect(decisionFor(floor, "floor-pr.merge")).toBe("deny");
    expect(decisionFor(floor, "floor-channel-reply")).toBe("notify");
  });

  it("(claim 4) deploy is present on the floor at ask rank", async () => {
    const policy = new PolicyStorageService(dir);
    const floor = await policy.floor();
    expect(decisionFor(floor, "floor-deploy")).toBe("ask");
  });

  it("(claim 3 step 1) agent.delegate is present on the floor at notify rank", async () => {
    const policy = new PolicyStorageService(dir);
    const floor = await policy.floor();
    expect(decisionFor(floor, "floor-agent.delegate")).toBe("notify");
  });

  it("(pr.open coverage gap found by the required claim-3 grep) pr.open is present on the floor at notify rank", async () => {
    const policy = new PolicyStorageService(dir);
    const floor = await policy.floor();
    expect(decisionFor(floor, "floor-pr.open")).toBe("notify");
  });

  it("onModuleInit seeds a fresh dir with the canonical DEFAULT_FLOOR", async () => {
    const policy = new PolicyStorageService(dir);
    await policy.onModuleInit();
    const raw = await fs.readFile(path.join(dir, "POLICY.md"), "utf8");
    expect(raw).toContain("floor-pr.merge");
    const floor = await policy.floor();
    expect(decisionFor(floor, "floor-purchase")).toBe("ask");
  });
});
