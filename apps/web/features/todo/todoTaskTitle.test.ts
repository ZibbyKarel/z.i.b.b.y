import { describe, expect, it } from "vitest";
import { todoTaskTitle } from "./todoTaskTitle";

describe("todoTaskTitle", () => {
  it("takes the first non-empty line", () => {
    expect(todoTaskTitle("\n  \nFix login\nsecond line")).toBe("Fix login");
  });

  it("collapses whitespace", () => {
    expect(todoTaskTitle("  Fix \t  the   login ")).toBe("Fix the login");
  });

  it("keeps mention tokens", () => {
    expect(todoTaskTitle("@Kodér fix #Zibby /review now")).toBe("@Kodér fix #Zibby /review now");
  });

  it("leaves an 80-char title alone and cuts longer ones to 80 with an ellipsis", () => {
    const eighty = "a".repeat(80);
    expect(todoTaskTitle(eighty)).toBe(eighty);
    const cut = todoTaskTitle("a".repeat(81));
    expect(cut).toBe(`${"a".repeat(79)}…`);
    expect(cut).toHaveLength(80);
  });

  it("returns an empty string for blank text", () => {
    expect(todoTaskTitle(" \n ")).toBe("");
  });
});
