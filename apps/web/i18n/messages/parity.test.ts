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
});
