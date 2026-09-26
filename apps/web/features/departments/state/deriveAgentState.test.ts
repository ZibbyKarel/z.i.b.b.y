import { describe, expect, it } from "vitest";
import { type AgentStateRun, deriveAgentState } from "./deriveAgentState";

const NOW = new Date("2026-09-25T12:00:00.000Z");
const run = (over: Partial<AgentStateRun>): AgentStateRun => ({ status: "done", ...over });

describe("deriveAgentState — O-04 mapping", () => {
  it("no runs, not queued → idle", () => {
    expect(deriveAgentState([], false, NOW)).toBe("idle");
  });

  it("no runs, queued → thinking", () => {
    expect(deriveAgentState([], true, NOW)).toBe("thinking");
  });

  it("a running run → working, even alongside other terminal runs", () => {
    expect(
      deriveAgentState([run({ status: "error" }), run({ status: "running" })], false, NOW),
    ).toBe("working");
  });

  it("awaiting-approval → blocked", () => {
    expect(deriveAgentState([run({ status: "awaiting-approval" })], false, NOW)).toBe("blocked");
  });

  it("paused-limit → blocked", () => {
    expect(deriveAgentState([run({ status: "paused-limit" })], false, NOW)).toBe("blocked");
  });

  it("error within the last 60 min → error", () => {
    expect(
      deriveAgentState([run({ status: "error", endedAt: "2026-09-25T11:30:00.000Z" })], false, NOW),
    ).toBe("error");
  });

  it("interrupted within the last 60 min → error", () => {
    expect(
      deriveAgentState(
        [run({ status: "interrupted", endedAt: "2026-09-25T11:59:00.000Z" })],
        false,
        NOW,
      ),
    ).toBe("error");
  });

  it("error older than 60 min → falls through to idle", () => {
    expect(
      deriveAgentState([run({ status: "error", endedAt: "2026-09-25T10:00:00.000Z" })], false, NOW),
    ).toBe("idle");
  });

  it("done within the last 10 min → done", () => {
    expect(
      deriveAgentState([run({ status: "done", endedAt: "2026-09-25T11:55:00.000Z" })], false, NOW),
    ).toBe("done");
  });

  it("done older than 10 min, queued → falls through to thinking", () => {
    expect(
      deriveAgentState([run({ status: "done", endedAt: "2026-09-25T11:00:00.000Z" })], true, NOW),
    ).toBe("thinking");
  });

  it("done older than 10 min, not queued → idle", () => {
    expect(
      deriveAgentState([run({ status: "done", endedAt: "2026-09-25T11:00:00.000Z" })], false, NOW),
    ).toBe("idle");
  });

  it("a run with no endedAt is never treated as recent", () => {
    expect(deriveAgentState([run({ status: "done", endedAt: undefined })], false, NOW)).toBe(
      "idle",
    );
  });
});
