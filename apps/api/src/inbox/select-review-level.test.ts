import { describe, expect, it } from "vitest";
import { selectReviewLevel } from "./select-review-level";

const f = (filename: string, additions = 1, deletions = 0) => ({ filename, additions, deletions });

describe("selectReviewLevel (todo-16)", () => {
  it("a UI file → browser", () => {
    expect(selectReviewLevel([f("src/App.tsx")])).toBe("browser");
  });

  it.each(["web/x.JSX", "a.vue", "b.svelte", "c.css", "d.scss", "e.html"])(
    "%s → browser",
    (name) => {
      expect(selectReviewLevel([f(name)])).toBe("browser");
    },
  );

  it("a security-sensitive path → thorough", () => {
    expect(selectReviewLevel([f("apps/api/src/auth/guard.ts")])).toBe("thorough");
  });

  it("a .sql file → thorough", () => {
    expect(selectReviewLevel([f("db/001.sql")])).toBe("thorough");
  });

  it("more than 20 files → thorough", () => {
    const files = Array.from({ length: 21 }, (_, i) => f(`src/m${i}.ts`));
    expect(selectReviewLevel(files)).toBe("thorough");
  });

  it("exactly 20 innocuous files → tested", () => {
    const files = Array.from({ length: 20 }, (_, i) => f(`src/m${i}.ts`));
    expect(selectReviewLevel(files)).toBe("tested");
  });

  it("more than 500 changed lines → thorough", () => {
    expect(selectReviewLevel([f("src/big.ts", 300, 201)])).toBe("thorough");
  });

  it("exactly 500 changed lines on an innocuous path → tested", () => {
    expect(selectReviewLevel([f("src/big.ts", 300, 200)])).toBe("tested");
  });

  it("a plain code file → tested", () => {
    expect(selectReviewLevel([f("src/util.ts")])).toBe("tested");
  });

  it("docs and config only → quick", () => {
    expect(selectReviewLevel([f("README.md"), f("docs/x.md"), f("pnpm-lock.yaml")])).toBe("quick");
  });

  it("a code-looking file under docs/ is still docs → quick", () => {
    expect(selectReviewLevel([f("docs/example.ts"), f("config.toml")])).toBe("quick");
  });

  it("an empty list → quick", () => {
    expect(selectReviewLevel([])).toBe("quick");
  });

  it("first match wins: browser beats thorough", () => {
    expect(selectReviewLevel([f("x.tsx"), f("auth.ts")])).toBe("browser");
  });
});
