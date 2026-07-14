import { describe, expect, it } from "vitest";
import cs from "./cs.json";
import en from "./en.json";

function keys(o: Record<string, unknown>, p = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`],
  );
}

describe("i18n catalog parity", () => {
  it("cs and en have identical key sets", () => {
    expect(new Set(keys(cs))).toEqual(new Set(keys(en)));
  });
  it("has the phase-2 chrome keys (new + reused)", () => {
    for (const key of [
      "chat.toolDock.label", // new this phase
      "chat.tasks.title", // existing, copy updated
      "chat.statusPill.nominal", // existing, copy confirmed
      "topbar.langSwitcherLabel", // existing, reused by LangSwitch
      "nav.settings", // existing, reused by the tool dock
    ]) {
      expect(keys(en)).toContain(key);
      expect(keys(cs)).toContain(key);
    }
  });
  it("keeps chat.close for its surviving consumer (CoreOverviewDialog)", () => {
    expect(keys(en)).toContain("chat.close");
    expect(keys(cs)).toContain("chat.close");
  });
  it("has the status-flyout keys (phase 3a)", () => {
    for (const key of [
      "chat.statusPill.flyout.working.title",
      "chat.statusPill.flyout.working.emptyTitle",
      "chat.statusPill.flyout.working.emptyBody",
      "chat.statusPill.flyout.waiting.title",
      "chat.statusPill.flyout.waiting.emptyTitle",
      "chat.statusPill.flyout.waiting.emptyBody",
      "chat.statusPill.flyout.loading",
      "chat.statusPill.flyout.errorTitle",
      "chat.statusPill.flyout.errorBody",
      "chat.statusPill.flyout.retry",
      // reused by flyout rows — must keep existing:
      "approval.approve",
      "approval.reject",
      "approval.holdToApprove",
    ]) {
      expect(keys(en)).toContain(key);
      expect(keys(cs)).toContain(key);
    }
  });
  it("has the phase-3b HUD-switch key and drops the removed mode label", () => {
    expect(keys(en)).toContain("chat.hudSwitchLabel");
    expect(keys(cs)).toContain("chat.hudSwitchLabel");
    expect(keys(en)).not.toContain("chat.modeLabel");
    expect(keys(cs)).not.toContain("chat.modeLabel");
  });
});
