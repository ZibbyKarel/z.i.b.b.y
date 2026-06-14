import { describe, expect, it, vi } from "vitest";
import { type VoiceActionDeps, runVoiceAction } from "./runVoiceAction";

function makeDeps(over: Partial<VoiceActionDeps> = {}): VoiceActionDeps {
  return {
    approve: vi.fn(),
    reject: vi.fn(),
    stop: vi.fn(),
    navigate: vi.fn(),
    dispatchTask: vi.fn(),
    brief: vi.fn(),
    close: vi.fn(),
    ...over,
  };
}

describe("runVoiceAction", () => {
  it("approves the latest pending approval", () => {
    const deps = makeDeps({ pendingApprovalId: "appr-1" });
    expect(runVoiceAction({ kind: "approveLatest" }, deps)).toEqual({
      key: "approved",
    });
    expect(deps.approve).toHaveBeenCalledWith("appr-1");
  });

  it("approve with nothing pending acts on nothing", () => {
    const deps = makeDeps();
    expect(runVoiceAction({ kind: "approveLatest" }, deps)).toEqual({
      key: "nothingToApprove",
    });
    expect(deps.approve).not.toHaveBeenCalled();
  });

  it("rejects the latest pending approval", () => {
    const deps = makeDeps({ pendingApprovalId: "appr-2" });
    expect(runVoiceAction({ kind: "rejectLatest" }, deps)).toEqual({
      key: "rejected",
    });
    expect(deps.reject).toHaveBeenCalledWith("appr-2");
  });

  it("reject with nothing pending acts on nothing", () => {
    const deps = makeDeps();
    expect(runVoiceAction({ kind: "rejectLatest" }, deps)).toEqual({
      key: "nothingToReject",
    });
  });

  it("stops the active run", () => {
    const deps = makeDeps({ activeRunId: "run-9" });
    expect(runVoiceAction({ kind: "stopActive" }, deps)).toEqual({
      key: "stopped",
    });
    expect(deps.stop).toHaveBeenCalledWith("run-9");
  });

  it("stop with no running agent acts on nothing", () => {
    const deps = makeDeps();
    expect(runVoiceAction({ kind: "stopActive" }, deps)).toEqual({
      key: "nothingToStop",
    });
    expect(deps.stop).not.toHaveBeenCalled();
  });

  it("navigates and exits the overlay", () => {
    const deps = makeDeps();
    expect(
      runVoiceAction({ kind: "navigate", route: "/runs", page: "runs" }, deps),
    ).toEqual({ key: "navigating", values: { page: "runs" } });
    expect(deps.close).toHaveBeenCalled();
    expect(deps.navigate).toHaveBeenCalledWith("/runs");
  });

  it("closes the overlay", () => {
    const deps = makeDeps();
    expect(runVoiceAction({ kind: "closeOverlay" }, deps)).toEqual({
      key: "closing",
    });
    expect(deps.close).toHaveBeenCalled();
  });

  it("speaks the briefing on a status request (pull, not push)", () => {
    const deps = makeDeps();
    expect(runVoiceAction({ kind: "briefing" }, deps)).toEqual({
      key: "briefing",
    });
    expect(deps.brief).toHaveBeenCalled();
  });

  it("dispatches plain speech straight to the tasks layer (no modal)", () => {
    const deps = makeDeps();
    expect(
      runVoiceAction({ kind: "createTask", text: "fix the build" }, deps),
    ).toEqual({ key: "dispatching", values: { task: "fix the build" } });
    expect(deps.dispatchTask).toHaveBeenCalledWith("fix the build");
  });

  it("an empty utterance is a no-op — nothing dispatched", () => {
    const deps = makeDeps();
    expect(
      runVoiceAction({ kind: "createTask", text: "   " }, deps),
    ).toEqual({ key: "heard" });
    expect(deps.dispatchTask).not.toHaveBeenCalled();
  });
});
