import { describe, expect, it } from "vitest";
import { SUBSYSTEM_LABEL, deriveHealthPresentation, subsystemDotTone } from "./healthPresentation";

describe("deriveHealthPresentation", () => {
  it("shows the connecting state while the first fetch is in flight", () => {
    const p = deriveHealthPresentation({
      isConnecting: true,
      isOnline: false,
      isDegraded: false,
    });
    expect(p).toMatchObject({
      tone: "warn",
      dotTone: "wait",
      pulse: true,
      label: "overview.systemConnecting",
    });
  });

  it("shows offline when the API does not answer", () => {
    const p = deriveHealthPresentation({
      isConnecting: false,
      isOnline: false,
      isDegraded: false,
    });
    expect(p).toMatchObject({
      tone: "bad",
      dotTone: "bad",
      pulse: false,
      label: "overview.systemOffline",
      detail: "overview.apiUnreachable",
    });
  });

  it("shows degraded (between online and offline) when claude preflight fails", () => {
    const p = deriveHealthPresentation({
      isConnecting: false,
      isOnline: true,
      isDegraded: true,
    });
    expect(p).toMatchObject({
      tone: "warn",
      dotTone: "wait",
      pulse: false,
      label: "overview.systemDegraded",
      detail: "overview.claudeUnavailable",
    });
  });

  it("shows nominal when online and the claude preflight passes", () => {
    const p = deriveHealthPresentation({
      isConnecting: false,
      isOnline: true,
      isDegraded: false,
    });
    expect(p).toMatchObject({
      tone: "ok",
      dotTone: "ok",
      pulse: false,
      label: "overview.systemNominal",
      detail: "overview.daemonReady",
    });
  });
});

describe("subsystemDotTone (M8 per-subsystem HUD)", () => {
  it("maps ok→ok, degraded→wait, down→bad", () => {
    expect(subsystemDotTone("ok")).toBe("ok");
    expect(subsystemDotTone("degraded")).toBe("wait");
    expect(subsystemDotTone("down")).toBe("bad");
  });

  it("has a label for every subsystem name", () => {
    expect(Object.keys(SUBSYSTEM_LABEL).sort()).toEqual([
      "backend",
      "integrations",
      "scheduler",
      "vault",
    ]);
  });
});
