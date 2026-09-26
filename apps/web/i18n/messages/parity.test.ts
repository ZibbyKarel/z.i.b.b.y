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
});
