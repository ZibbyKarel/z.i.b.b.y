import { describe, expect, it } from "vitest";
import {
  type CiAutofixPr,
  type CiFixRun,
  type CiTriageRun,
  decideCiAutofix,
  fixAttempts,
} from "./ci-autofix";

const H1 = "a".repeat(40);
const H2 = "b".repeat(40);
const H3 = "c".repeat(40);
const T1 = "2026-11-12T10:00:00.000Z";
const T2 = "2026-11-12T11:00:00.000Z";

const pr = (over: Partial<CiAutofixPr> = {}): CiAutofixPr => ({
  bucket: "mine",
  headSha: H1,
  ci: "failing",
  ciSettled: true,
  ciFailingChecks: ["test"],
  ciCompletedAt: T1,
  ...over,
});

const triage = (over: Partial<CiTriageRun> = {}): CiTriageRun => ({
  taskId: "tr1",
  headSha: H1,
  state: "triaged",
  verdict: "code",
  failingChecks: ["test"],
  ciCompletedAt: T1,
  dead: false,
  ...over,
});

const fix = (over: Partial<CiFixRun> = {}): CiFixRun => ({
  taskId: "fx1",
  headSha: H1,
  state: "pushed",
  fixedSha: H2,
  triageTaskId: "tr1",
  dead: false,
  ...over,
});

describe("decideCiAutofix", () => {
  it("triages a settled red CI on my PR", () => {
    expect(decideCiAutofix(pr(), [], [])).toEqual({ kind: "triage" });
  });

  it("ignores others' PRs, drafts, unsettled or non-red CI", () => {
    expect(decideCiAutofix(pr({ bucket: "to-review" }), [], [])).toEqual({ kind: "none" });
    expect(decideCiAutofix(pr({ draft: true }), [], [])).toEqual({ kind: "none" });
    expect(decideCiAutofix(pr({ ciSettled: false }), [], [])).toEqual({ kind: "none" });
    expect(decideCiAutofix(pr({ ci: "passing" }), [], [])).toEqual({ kind: "none" });
    expect(decideCiAutofix(pr({ headSha: undefined }), [], [])).toEqual({ kind: "none" });
  });

  it("waits while a triage or fix is in flight, unless that task is dead", () => {
    expect(decideCiAutofix(pr(), [triage({ state: "running" })], [])).toEqual({ kind: "none" });
    expect(decideCiAutofix(pr(), [], [fix({ state: "awaiting-approval" })])).toEqual({
      kind: "none",
    });
    expect(
      decideCiAutofix(pr(), [triage({ state: "running", ciCompletedAt: "x", dead: true })], []),
    ).toEqual({ kind: "triage" });
  });

  it("never triages the same CI result twice", () => {
    expect(decideCiAutofix(pr(), [triage({ state: "fix-started" })], [])).toEqual({
      kind: "none",
    });
    expect(decideCiAutofix(pr(), [triage({ state: "discarded" })], [])).toEqual({ kind: "none" });
  });

  it("re-triages once CI settled again on a newer result", () => {
    expect(decideCiAutofix(pr({ ciCompletedAt: T2 }), [triage({ state: "rerun" })], [])).toEqual({
      kind: "triage",
    });
  });

  it("flaky/infra → rerun, at most twice per head, then the fixer", () => {
    expect(decideCiAutofix(pr(), [triage({ verdict: "flaky" })], [])).toEqual({
      kind: "rerun",
      triageTaskId: "tr1",
    });
    const reruns = [
      triage({ taskId: "r1", state: "rerun", ciCompletedAt: "2026-11-12T08:00:00.000Z" }),
      triage({ taskId: "r2", state: "rerun", ciCompletedAt: "2026-11-12T09:00:00.000Z" }),
    ];
    expect(decideCiAutofix(pr(), [...reruns, triage({ verdict: "infra" })], [])).toEqual({
      kind: "fix",
      triageTaskId: "tr1",
    });
  });

  it("code / unclear → fix", () => {
    expect(decideCiAutofix(pr(), [triage({ verdict: "unclear" })], [])).toEqual({
      kind: "fix",
      triageTaskId: "tr1",
    });
  });

  it("parks a triage without a verdict", () => {
    expect(decideCiAutofix(pr(), [triage({ state: "failed" })], [])).toMatchObject({
      kind: "park",
      triageTaskId: "tr1",
    });
  });

  it("parks when the same checks still fail on ZIBBY's own fix", () => {
    const before = triage({ taskId: "tr1", state: "fix-started" });
    const now = triage({ taskId: "tr2", headSha: H2, ciCompletedAt: T2 });
    expect(
      decideCiAutofix(pr({ headSha: H2, ciCompletedAt: T2 }), [before, now], [fix()]),
    ).toMatchObject({ kind: "park", triageTaskId: "tr2" });
  });

  it("fixes again when a different check fails after the first fix", () => {
    const before = triage({ taskId: "tr1", state: "fix-started" });
    const now = triage({ taskId: "tr2", headSha: H2, ciCompletedAt: T2, failingChecks: ["lint"] });
    expect(decideCiAutofix(pr({ headSha: H2, ciCompletedAt: T2 }), [before, now], [fix()])).toEqual(
      { kind: "fix", triageTaskId: "tr2" },
    );
  });

  it("parks after two fix attempts on one chain", () => {
    const fixes = [fix(), fix({ taskId: "fx2", headSha: H2, fixedSha: H3, triageTaskId: "tr2" })];
    const now = triage({ taskId: "tr3", headSha: H3, ciCompletedAt: T2, failingChecks: ["e2e"] });
    expect(decideCiAutofix(pr({ headSha: H3, ciCompletedAt: T2 }), [now], fixes)).toMatchObject({
      kind: "park",
      triageTaskId: "tr3",
    });
  });

  it("an operator push starts a fresh chain", () => {
    const fixes = [fix(), fix({ taskId: "fx2", headSha: H2, fixedSha: H3 })];
    const head = "d".repeat(40);
    expect(fixAttempts(head, fixes)).toBe(0);
    expect(fixAttempts(H3, fixes)).toBe(2);
  });

  it("a fix that pushed nothing still counts against its head", () => {
    expect(fixAttempts(H1, [fix({ state: "failed", fixedSha: undefined })])).toBe(1);
  });
});
