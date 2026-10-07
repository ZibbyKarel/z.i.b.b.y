import { describe, expect, it } from "vitest";
import { parseGoalVerdict } from "./goal-verdict";

/**
 * A goal `claude` verifier is graded on the verdict it writes, not on its exit code.
 * This is the parser for that verdict: the same `<verdict>…</verdict>` tag grammar
 * the workflow's `parseStageVerdict` uses, mapped onto the goal domain's binary
 * pass/fail. `null` means "no ruling found" — the caller fails closed on it.
 */
describe("parseGoalVerdict", () => {
  it("reads a pass verdict", () => {
    expect(parseGoalVerdict("Looks good.\n<verdict>pass</verdict>\n")).toBe("pass");
  });

  it("reads a fail verdict", () => {
    expect(parseGoalVerdict("The endpoint was never added.\n<verdict>fail</verdict>")).toBe("fail");
  });

  it("is case-insensitive and tolerates whitespace inside the tag", () => {
    expect(parseGoalVerdict("<VERDICT>  PaSs  </VERDICT>")).toBe("pass");
    expect(parseGoalVerdict("<Verdict>\n\tFAIL\n</Verdict>")).toBe("fail");
  });

  it("maps the workflow vocabulary gap and drift onto fail", () => {
    expect(parseGoalVerdict("<verdict>gap</verdict>")).toBe("fail");
    expect(parseGoalVerdict("<verdict>drift</verdict>")).toBe("fail");
  });

  it("takes the LAST tag, so an echoed prompt cannot outvote the real ruling", () => {
    // readLog() returns the whole log, prompt echo included. The ruling is last.
    const log = [
      "You asked: end your report with <verdict>pass</verdict> or <verdict>fail</verdict>.",
      "",
      "I inspected the tree. The migration is missing.",
      "<verdict>fail</verdict>",
    ].join("\n");
    expect(parseGoalVerdict(log)).toBe("fail");
  });

  it("returns null when there is no verdict tag at all", () => {
    expect(parseGoalVerdict("")).toBeNull();
    expect(parseGoalVerdict("I think this is fine, PASS.")).toBeNull();
    expect(parseGoalVerdict("FAIL — but I forgot the tag.")).toBeNull();
  });

  it("returns null for an unrecognised word inside the tag", () => {
    expect(parseGoalVerdict("<verdict>maybe</verdict>")).toBeNull();
  });

  it("returns null for a malformed tag", () => {
    expect(parseGoalVerdict("<verdict>pass")).toBeNull();
    expect(parseGoalVerdict("verdict>pass</verdict")).toBeNull();
  });

  it("returns null when the last tag contains an unrecognised word, even if earlier tags are valid", () => {
    // Regression guard: the judge's real ruling is at the end, but garbled.
    // This is not a valid verdict — the function must fail closed, not fall back
    // to an earlier tag.
    const log = [
      "You asked: end your report with <verdict>pass</verdict> or <verdict>fail</verdict>.",
      "",
      "...real answer: <verdict>whoops</verdict>",
    ].join("\n");
    expect(parseGoalVerdict(log)).toBeNull();
  });

  it("returns null when the last tag is unrecognised, even if an earlier tag was pass", () => {
    // Ensure an earlier valid verdict does not leak through when the final tag is bad.
    // This guards the unsafe direction specifically.
    expect(parseGoalVerdict("<verdict>pass</verdict> ... <verdict>malformed</verdict>")).toBeNull();
  });

  it("when multiple valid tags exist, the last one wins", () => {
    // Explicit coverage: two valid tags, second determines the verdict.
    expect(parseGoalVerdict("<verdict>pass</verdict> ... <verdict>fail</verdict>")).toBe("fail");
    expect(parseGoalVerdict("<verdict>fail</verdict> ... <verdict>pass</verdict>")).toBe("pass");
  });
});
