import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeCliTaskNamer, deriveTitleFallback } from "./claude-cli-task-namer";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};

/** Subclass that stubs the spawn so the parse/validate path runs without claude. */
class StubNamer extends ClaudeCliTaskNamer {
  constructor(private readonly raw: string) {
    super(fakeLogger as never);
  }
  protected override runClaude(): Promise<string> {
    return Promise.resolve(this.raw);
  }
}

describe("deriveTitleFallback", () => {
  it("uses the first non-empty line, collapsing whitespace", () => {
    expect(deriveTitleFallback("  fix  the\tlogin   bug \n more")).toBe("fix the login bug");
  });

  it("skips leading blank lines", () => {
    expect(deriveTitleFallback("\n\n  Refaktoruj dashboard  \ndetail")).toBe("Refaktoruj dashboard");
  });

  it("truncates an over-long line with an ellipsis", () => {
    const long = "a".repeat(200);
    const out = deriveTitleFallback(long);
    expect(out).toHaveLength(80);
    expect(out.endsWith("…")).toBe(true);
  });

  it("falls back to the whole text when there are no line breaks", () => {
    expect(deriveTitleFallback("single line task")).toBe("single line task");
  });
});

describe("ClaudeCliTaskNamer.name", () => {
  // The CLI path is guarded out under VITEST; clear it so the stubbed spawn runs,
  // and restore it after each test so other suites keep their token-free guard.
  const original = process.env.VITEST;
  afterEach(() => {
    process.env.VITEST = original;
  });

  it("returns null under the VITEST guard (never spawns)", async () => {
    const namer = new StubNamer('{"result":"{\\"title\\":\\"ignored\\"}"}');
    expect(await namer.name("do the thing")).toBeNull();
  });

  it("parses a valid title out of the claude envelope", async () => {
    delete process.env.VITEST;
    const namer = new StubNamer('{"result":"{\\"title\\":\\"Fix the login bug\\"}"}');
    expect(await namer.name("the login form throws on submit")).toBe("Fix the login bug");
  });

  it("tolerates fenced JSON in the result text", async () => {
    delete process.env.VITEST;
    const namer = new StubNamer('{"result":"```json\\n{\\"title\\":\\"Tidy up\\"}\\n```"}');
    expect(await namer.name("clean things up")).toBe("Tidy up");
  });

  it("rejects an over-long title (schema floor) → null", async () => {
    delete process.env.VITEST;
    const tooLong = "x".repeat(100);
    const namer = new StubNamer(`{"result":"{\\"title\\":\\"${tooLong}\\"}"}`);
    expect(await namer.name("whatever")).toBeNull();
  });

  it("returns null on unparseable output", async () => {
    delete process.env.VITEST;
    const namer = new StubNamer('{"result":"not json at all"}');
    expect(await namer.name("whatever")).toBeNull();
  });

  it("returns null for blank input without spawning", async () => {
    delete process.env.VITEST;
    const namer = new StubNamer('{"result":"{\\"title\\":\\"unused\\"}"}');
    expect(await namer.name("   ")).toBeNull();
  });
});
