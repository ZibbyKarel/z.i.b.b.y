import { describe, expect, it } from "vitest";
import { type VoiceAction, parseUtterance } from "./parseUtterance";

describe("parseUtterance", () => {
  describe("approve", () => {
    it.each([
      "schválit",
      "Schválit",
      "schvaluji",
      "potvrď",
      "potvrdit",
      "approve",
      "Approve it",
      "confirm",
      "accept that",
    ])("%s → approveLatest", (text) => {
      expect(parseUtterance(text)).toEqual({ kind: "approveLatest" });
    });

    it("a long sentence starting with 'approve' is a task, not a gate decision", () => {
      expect(parseUtterance("approve the budget increase for Q3")).toEqual({
        kind: "createTask",
        text: "approve the budget increase for Q3",
      });
    });
  });

  describe("reject", () => {
    it.each([
      "odmítnout",
      "Odmítni",
      "zamítnout",
      "zruš",
      "reject",
      "deny",
      "decline it",
    ])("%s → rejectLatest", (text) => {
      expect(parseUtterance(text)).toEqual({ kind: "rejectLatest" });
    });
  });

  describe("stop", () => {
    it.each(["zastav", "zastavit", "stop", "Stop it", "halt"])(
      "%s → stopActive",
      (text) => {
        expect(parseUtterance(text)).toEqual({ kind: "stopActive" });
      },
    );
  });

  describe("close", () => {
    it.each(["zavři", "zavřít", "konec", "close", "exit", "dismiss", "HUD"])(
      "%s → closeOverlay",
      (text) => {
        expect(parseUtterance(text)).toEqual({ kind: "closeOverlay" });
      },
    );
  });

  describe("navigate", () => {
    const cases: Array<[string, string]> = [
      ["jdi na runs", "/runs"],
      ["otevři běhy", "/runs"],
      ["přejdi na paměť", "/memory"],
      ["zobraz projekty", "/projects"],
      ["navigate to overview", "/overview"],
      ["go to gates", "/gates"],
      ["open integrations", "/projects"],
      ["show me approvals", "/gates"],
    ];
    it.each(cases)("%s → navigate %s", (text, route) => {
      const action = parseUtterance(text);
      expect(action.kind).toBe("navigate");
      expect((action as Extract<VoiceAction, { kind: "navigate" }>).route).toBe(
        route,
      );
    });

    it("an unknown page falls through to a task", () => {
      expect(parseUtterance("open the pod bay doors")).toEqual({
        kind: "createTask",
        text: "open the pod bay doors",
      });
    });

    it("a navigate verb with no target is a task", () => {
      expect(parseUtterance("otevři")).toEqual({
        kind: "createTask",
        text: "otevři",
      });
    });
  });

  describe("briefing (pull status)", () => {
    it.each([
      "co se děje",
      "Co se děje?",
      "co je nového",
      "status",
      "Status",
      "shrnutí",
      "briefing",
      "what's happening",
      "what's up",
      "brief me",
      "give me a briefing",
    ])("%s → briefing", (text) => {
      expect(parseUtterance(text)).toEqual({ kind: "briefing" });
    });

    it("a longer status-shaped sentence stays a task (exact phrase only)", () => {
      expect(parseUtterance("co se děje s buildem auth")).toEqual({
        kind: "createTask",
        text: "co se děje s buildem auth",
      });
    });
  });

  describe("createTask fallback", () => {
    it("keeps the raw utterance with diacritics intact", () => {
      expect(parseUtterance("Naplánuj poradu na pondělí")).toEqual({
        kind: "createTask",
        text: "Naplánuj poradu na pondělí",
      });
    });

    it("empty input → empty task (never throws)", () => {
      expect(parseUtterance("   ")).toEqual({ kind: "createTask", text: "" });
    });

    it("a normal English request → task", () => {
      expect(parseUtterance("fix the failing test in the auth service")).toEqual(
        { kind: "createTask", text: "fix the failing test in the auth service" },
      );
    });
  });
});
