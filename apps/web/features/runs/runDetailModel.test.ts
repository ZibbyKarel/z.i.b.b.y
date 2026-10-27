import {
  OPERATOR_QUESTION_ACTION,
  type OperatorMessage,
  type TaskRunStatus,
} from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import type { RunView } from "./run";
import {
  type RunMode,
  buildLiveFeed,
  buildRunMetrics,
  buildStageRail,
  deriveRunMode,
} from "./runDetailModel";

const NOW = Date.parse("2026-10-20T10:10:00Z");

const run = (patch: Partial<RunView>): RunView =>
  ({
    runId: "wf_1",
    kind: "workflow",
    status: "running",
    owner: "delivery",
    pct: null,
    startedAt: "2026-10-20T10:00:00Z",
    ...patch,
  }) as RunView;

describe("deriveRunMode", () => {
  const cases: [TaskRunStatus, RunMode][] = [
    ["scheduled", "waiting"],
    ["queued", "waiting"],
    ["pending", "waiting"],
    ["held", "waiting"],
    ["running", "running"],
    ["awaiting-approval", "approval"],
    ["paused", "paused"],
    ["parked", "parked"],
    ["paused-limit", "limit"],
    ["interrupted", "stopped"],
    ["error", "error"],
    ["done", "done"],
  ];
  it.each(cases)("%s → %s", (status, mode) => {
    expect(deriveRunMode(run({ status }), undefined)).toBe(mode);
  });

  it("held with an approval → approval", () => {
    expect(deriveRunMode(run({ status: "held" }), { action: "budget.override" })).toBe("approval");
  });

  it("awaiting-approval on an operator question → question", () => {
    expect(
      deriveRunMode(run({ status: "awaiting-approval" }), { action: OPERATOR_QUESTION_ACTION }),
    ).toBe("question");
  });

  it("running with a pause request → pausing", () => {
    expect(deriveRunMode(run({ pauseRequested: true }), undefined)).toBe("pausing");
  });
});

const threePhase = run({
  currentStage: "p2",
  currentStageStartedAt: new Date(NOW - 65_000).toISOString(),
  stageRuns: [
    {
      phaseId: "p1",
      runId: "r1",
      attempt: 1,
      status: "done",
      startedAt: "2026-10-20T10:00:00Z",
      finishedAt: "2026-10-20T10:01:42Z",
    },
    { phaseId: "p2", runId: "r2", attempt: 1, status: "error" },
  ],
});
const PHASES = ["p1", "p2", "p3"];

describe("buildStageRail", () => {
  it("times done, live and queued phases", () => {
    const rail = buildStageRail(threePhase, "running", PHASES, NOW);
    expect(rail.map((r) => [r.n, r.name, r.stateKey, r.state, r.meta, r.current])).toEqual([
      ["01", "p1", "done", "done", "01:42", false],
      ["02", "p2", "running", "working", "01:05 · ⇄01", true],
      ["03", "p3", "queued", "idle", "—", false],
    ]);
  });

  it("an agent run is one row timed from startedAt", () => {
    const rail = buildStageRail(
      run({ kind: "agent", processor: { kind: "agent", id: "a", name: "Kodér" } }),
      "running",
      undefined,
      NOW,
    );
    expect(rail).toMatchObject([{ n: "01", name: "Kodér", stateKey: "running", meta: "10:00" }]);
  });

  it("a goal run has no rail", () => {
    expect(buildStageRail(run({ kind: "goal" }), "running", undefined, NOW)).toEqual([]);
  });
});

describe("buildRunMetrics", () => {
  const value = (metrics: ReturnType<typeof buildRunMetrics>, key: string) =>
    metrics.find((m) => m.key === key)?.value;

  it("progress counts done stages", () => {
    const rail = buildStageRail(threePhase, "running", PHASES, NOW);
    const metrics = buildRunMetrics(threePhase, rail, 3, NOW);
    expect(value(metrics, "progress")).toBe("33%");
    expect(value(metrics, "stage")).toBe("02/03");
    expect(value(metrics, "retries")).toBe("01/03");
    expect(value(metrics, "elapsed")).toBe("10m 0s");
    expect(value(metrics, "cost")).toBe("—");
    expect(metrics).toHaveLength(6);
  });

  it("a done run is 100%", () => {
    const done = run({ status: "done", currentStage: null, stageRuns: threePhase.stageRuns });
    const rail = buildStageRail(done, "done", PHASES, NOW);
    expect(value(buildRunMetrics(done, rail, undefined, NOW), "progress")).toBe("100%");
  });
});

describe("buildLiveFeed", () => {
  const rail = buildStageRail(threePhase, "running", PHASES, NOW);
  const delivered: OperatorMessage = {
    id: "m1",
    text: "use the v2 api",
    to: "p2",
    at: "2026-10-20T10:05:00Z",
    deliveredAt: "2026-10-20T10:08:55Z",
    deliveredPhaseId: "p2",
  };
  const pending: OperatorMessage = {
    id: "m2",
    text: "also add tests",
    to: "p3",
    at: "2026-10-20T10:09:00Z",
  };
  const feed = (terminal: boolean) =>
    buildLiveFeed({
      rail,
      selectedPhaseId: null,
      transcript: "Working on it.\n● Read(file.ts)\n",
      messages: [pending, delivered],
      terminal,
    });

  it("orders dividers, the current agent, delivered then queued messages", () => {
    expect(feed(false).map((i) => `${i.kind}:${"id" in i ? i.id : i.phaseId}`)).toEqual([
      "divider:p1",
      "divider:p2",
      "agent:p2",
      "you:m1",
      "you:m2",
    ]);
    expect(feed(false).at(-1)).toMatchObject({ delivery: "queued" });
    expect(feed(false).find((i) => i.kind === "you" && i.id === "m1")).toMatchObject({
      delivery: "delivered",
      deliveredPhaseId: "p2",
    });
  });

  it("an undelivered message reads NOT DELIVERED once the run is terminal", () => {
    expect(feed(true).at(-1)).toMatchObject({ id: "m2", delivery: "undelivered" });
  });

  it("splits the transcript into markdown and tool lines", () => {
    expect(feed(false).find((i) => i.kind === "agent")).toMatchObject({
      markdown: "Working on it.",
      tools: [{ id: "p2-0", ts: "01", text: "Read(file.ts)" }],
      live: true,
    });
  });

  it("renders a tool phase's log as raw rows, errors flagged", () => {
    const agent = buildLiveFeed({
      rail,
      selectedPhaseId: null,
      messages: [],
      terminal: false,
      toolPhaseIds: new Set(["p2"]),
      transcript:
        "produce: round 1/3: generating 2 image(s): p01, p02 [mock/mock]\r 50%|█| 2/4\nproduce: p01 attempt 1 rejected: too-gray\nproduct-factory: fal 500\n",
    }).find((i) => i.kind === "agent");
    expect(agent).toMatchObject({
      markdown: "",
      tools: [
        { id: "p2-0", ts: "01", text: " 50%|█| 2/4" },
        { id: "p2-1", ts: "02", text: "produce: p01 attempt 1 rejected: too-gray", state: "error" },
        { id: "p2-2", ts: "03", text: "product-factory: fal 500", state: "error" },
      ],
    });
  });

  it("a tqdm-only live tool log still shows rows", () => {
    const agent = buildLiveFeed({
      rail,
      selectedPhaseId: null,
      messages: [],
      terminal: false,
      toolPhaseIds: new Set(["p2"]),
      transcript: "\r 25%|▎| 1/4\r 50%|█| 2/4",
    }).find((i) => i.kind === "agent");
    expect(agent).toMatchObject({ tools: [{ text: " 50%|█| 2/4" }] });
  });

  it("a blank tool log on a finished phase yields no agent item", () => {
    expect(
      buildLiveFeed({
        rail,
        selectedPhaseId: "p1",
        messages: [],
        terminal: false,
        toolPhaseIds: new Set(["p1"]),
        transcript: "  \n",
      }).some((i) => i.kind === "agent"),
    ).toBe(false);
  });
});
