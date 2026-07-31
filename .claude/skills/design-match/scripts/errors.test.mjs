import { describe, expect, it } from "vitest";
import {
  DesignMatchError,
  describing,
  isDeliberateError,
  operationOf,
  translatePlaywrightError,
} from "./errors.mjs";

/**
 * The unit half of I1. The half that matters more is in
 * `measure.browser.test.mjs` / `compare.browser.test.mjs`: a boundary is easy to
 * test at the boundary and leave unpinned at the call sites that feed it, which
 * is exactly how instance 5 survived a per-call fix. Every open instance
 * therefore has a control that goes through the real browser and the real CLI.
 */
describe("isDeliberateError", () => {
  it("recognises the tool's own refusal by identity, whatever happened to its message", () => {
    // The defect, stated as a test: a library in the call path rewrites the
    // message and the prefix moves off the front. Under the old string test this
    // is `false` and the operator gets a stack for a refusal.
    const refusal = new DesignMatchError("design-match: compare vyžaduje --slug <slug>");
    refusal.message = `page.evaluate: Error: ${refusal.message}`;
    expect(isDeliberateError(refusal)).toBe(true);
  });

  // The floor, not the mechanism: kept so a `design-match:` sentence raised from
  // somewhere that could not construct the class still reads as a refusal.
  it("still accepts a plain design-match:-prefixed Error", () => {
    expect(isDeliberateError(new Error("design-match: compare vyžaduje --slug <slug>"))).toBe(true);
  });

  it("treats anything else as an unexpected crash needing its stack", () => {
    expect(isDeliberateError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isDeliberateError("not even an Error instance")).toBe(false);
    // compare-values.mjs's marker, which must stay a crash.
    expect(isDeliberateError(new Error("design-match BUG: skeleton gate propustil…"))).toBe(false);
  });
});

describe("describing", () => {
  it("returns the operation's value untouched when nothing throws", async () => {
    await expect(describing({ kind: "navigate" }, () => Promise.resolve(7))).resolves.toBe(7);
  });

  it("attaches the context to whatever throws and rethrows the same error object", async () => {
    const thrown = new Error("boom");
    const caught = await describing({ kind: "navigate", url: "http://x/y" }, () =>
      Promise.reject(thrown),
    ).catch((error) => error);
    expect(caught).toBe(thrown);
    expect(operationOf(caught)).toMatchObject({ kind: "navigate", url: "http://x/y" });
  });

  // The innermost annotation is the specific one — `shootElement` knows the
  // region and the remedy, an outer helper only knows "we were shooting".
  it("keeps the innermost context when an annotated call is nested inside another", async () => {
    const caught = await describing({ kind: "outer" }, () =>
      describing({ kind: "inner" }, () => Promise.reject(new Error("boom"))),
    ).catch((error) => error);
    expect(operationOf(caught)).toMatchObject({ kind: "inner" });
  });

  // A stack is the diagnostic for a crash, and an operation record printed
  // beside it would be noise. `util.inspect` shows own ENUMERABLE symbols.
  it("hides the context from the crash output it rides on", async () => {
    const caught = await describing({ kind: "navigate" }, () =>
      Promise.reject(new Error("boom")),
    ).catch((error) => error);
    expect(
      Object.getOwnPropertySymbols(caught).filter((s) => caught.propertyIsEnumerable(s)),
    ).toEqual([]);
  });
});

describe("translatePlaywrightError", () => {
  const withOperation = (error, operation) => {
    // Same shape `describing` produces, built directly so the table below is
    // testable without a browser.
    const wrapped = describing(operation, () => Promise.reject(error));
    return wrapped.catch((caught) => caught);
  };

  /*
   * Instance 1/2's fix, re-stated at the boundary: a navigation that times out is
   * a page that never loaded. It is op-gated on purpose — a `waitFor` timeout is
   * NOT that fact, and naming the page as the cause there would be a confident
   * wrong answer.
   */
  const navigationTimeout = () =>
    Object.assign(
      new Error(
        'page.goto: Timeout 30000ms exceeded.\nCall log:\n  - navigating to "http://127.0.0.1:1/x.html", waiting until "load"',
      ),
      { name: "TimeoutError" },
    );

  it("turns a navigation timeout into the clean one-line treatment", async () => {
    const refusal = translatePlaywrightError(
      await withOperation(navigationTimeout(), {
        kind: "navigate",
        url: "http://127.0.0.1:1/x.html",
      }),
    );
    expect(isDeliberateError(refusal)).toBe(true);
    expect(refusal.message).toContain("http://127.0.0.1:1/x.html");
    // D7 (task 17): the fatal wait is `load`, not `networkidle`.
    expect(refusal.message).toMatch(/load/);
    expect(refusal.message).toMatch(/dev server|Storybook/);
    expect(refusal.message).not.toContain("Call log");
  });

  // Recognition never depends on the annotation — that is the property the
  // per-call translators did not have. Drop it and the line is still clean.
  it("recognises a navigation timeout that no call site annotated", () => {
    const refusal = translatePlaywrightError(navigationTimeout());
    expect(isDeliberateError(refusal)).toBe(true);
    expect(refusal.message).toContain("http://127.0.0.1:1/x.html");
    expect(refusal.message).not.toContain("undefined");
  });

  it("leaves a timeout that was not a navigation alone, stack and all", async () => {
    const timeout = Object.assign(new Error("locator.waitFor: Timeout 30000ms exceeded."), {
      name: "TimeoutError",
    });
    const passed = await withOperation(timeout, { kind: "capture", selector: "#root" });
    expect(translatePlaywrightError(passed)).toBe(timeout);
  });

  /*
   * Instance 4 — the commonest operator error the tool has: the dev server is
   * not running. `name` is plain `"Error"`, which is why the TimeoutError test
   * missed it for the whole branch.
   */
  it("turns an unreachable origin into one line naming the url and the net:: code", async () => {
    const refused = new Error(
      "page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:59999/impl.html\nCall log:\n  - navigating",
    );
    const refusal = translatePlaywrightError(
      await withOperation(refused, { kind: "navigate", url: "http://127.0.0.1:59999/impl.html" }),
    );
    expect(isDeliberateError(refusal)).toBe(true);
    expect(refusal.message).toContain("http://127.0.0.1:59999/impl.html");
    expect(refusal.message).toContain("ERR_CONNECTION_REFUSED");
    expect(refusal.message).toMatch(/dev server|Storybook/);
    expect(refusal.message).not.toContain("Call log");
  });

  // The point of moving recognition off the call sites: an un-annotated call
  // site loses detail, never the clean line. The url is recovered from the
  // message rather than invented.
  it("still refuses cleanly when no call site annotated the operation", () => {
    const refusal = translatePlaywrightError(
      new Error("page.goto: net::ERR_NAME_NOT_RESOLVED at http://nope.invalid/x"),
    );
    expect(isDeliberateError(refusal)).toBe(true);
    expect(refusal.message).toContain("http://nope.invalid/x");
    expect(refusal.message).not.toContain("undefined");
  });

  /*
   * Instance 5/6. Both spellings, because both are reachable from one typo:
   * `.sm:flex` reaches the browser and comes back as the DOM's SyntaxError,
   * `div[` is refused by Playwright's own parser first.
   */
  it("turns an unparseable selector into one line naming it, from either parser", async () => {
    const inPage = new Error(
      "page.evaluate: SyntaxError: Failed to execute 'querySelector' on 'Document': '.sm:flex' is not a valid selector.",
    );
    const fromPlaywright = new Error(
      'locator.all: Unexpected token "" while parsing css selector "div[". Did you mean to CSS.escape it?',
    );

    const first = translatePlaywrightError(
      await withOperation(inPage, { kind: "extract", selector: ".sm:flex" }),
    );
    expect(isDeliberateError(first)).toBe(true);
    // The selector is the actionable fact, and it is the call site's, not the
    // message's. The remedy names both flags rather than guessing which one the
    // operator typed — a wrong flag would be a claim the tool cannot back.
    expect(first.message).toContain(".sm:flex");
    expect(first.message).toContain("--selector");
    expect(first.message).toContain("--mask");
    expect(first.message).not.toContain("Failed to execute");

    const second = translatePlaywrightError(
      await withOperation(fromPlaywright, { kind: "mask", selector: "div[" }),
    );
    expect(isDeliberateError(second)).toBe(true);
    expect(second.message).toContain("div[");
    expect(second.message).not.toContain("Unexpected token");
  });

  it("recovers the selector from the message when the call site named none", () => {
    const refusal = translatePlaywrightError(
      new Error(
        "page.evaluate: SyntaxError: Failed to execute 'querySelector' on 'Document': '.sm:flex' is not a valid selector.",
      ),
    );
    expect(isDeliberateError(refusal)).toBe(true);
    expect(refusal.message).toContain(".sm:flex");
    expect(refusal.message).not.toContain("undefined");
  });

  /*
   * Instance 3 (already fixed, wording preserved verbatim) and instance 7 (the
   * same Chromium refusal through `page.screenshot`) — one rule, two contexts.
   */
  it("turns Chromium's capture refusal into one clean line naming the region, its box and the caller's remedy", async () => {
    const refusal = translatePlaywrightError(
      await withOperation(
        new Error(
          "locator.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot\nCall log:\n  - taking element screenshot",
        ),
        {
          kind: "capture",
          selector: "div.design-canvas > div > div:nth-child(1)",
          box: { x: -6000, y: -6000, w: 16256, h: 18608 },
          remedy: " Vyber jiný region.",
        },
      ),
    );
    expect(isDeliberateError(refusal)).toBe(true);
    expect(refusal.message).toContain("div.design-canvas > div > div:nth-child(1)");
    expect(refusal.message).toContain("16256×18608");
    expect(refusal.message).toContain("(-6000,-6000)");
    expect(refusal.message).toContain("Vyber jiný region.");
    expect(refusal.message).not.toContain("Call log");
  });

  it("still refuses cleanly when the caller has no box to name", async () => {
    const refusal = translatePlaywrightError(
      await withOperation(
        new Error(
          "locator.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot",
        ),
        { kind: "capture", selector: "#root", remedy: " Zkus jiný." },
      ),
    );
    expect(isDeliberateError(refusal)).toBe(true);
    expect(refusal.message).not.toContain("undefined");
    expect(refusal.message).not.toContain("NaN");
  });

  // Instance 7's own sentence. The refused shot is the PAGE, so every candidate
  // loses its preview at once and the inventory never printed — "choose another
  // --region" would name a remedy this run has not made available.
  it("says what is true when the refused shot was the whole page's preview pass", async () => {
    const refusal = translatePlaywrightError(
      await withOperation(
        new Error(
          "page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot",
        ),
        {
          kind: "preview",
          index: 1,
          selector: "div.card",
          pageSize: { width: 20000, height: 9000 },
        },
      ),
    );
    expect(isDeliberateError(refusal)).toBe(true);
    expect(refusal.message).toContain("20000×9000");
    expect(refusal.message).toContain("inventura");
    expect(refusal.message).not.toContain("--region");
  });

  it("passes a genuine crash through untouched, stack and all", async () => {
    const crash = new TypeError("Cannot read properties of undefined (reading 'box')");
    const passed = await withOperation(crash, { kind: "capture", selector: "#root" });
    expect(translatePlaywrightError(passed)).toBe(crash);
    expect(translatePlaywrightError("not even an Error instance")).toBe(
      "not even an Error instance",
    );
  });

  // Our own refusal is already the answer. Re-reading its message here would be
  // the string test coming back in through the window.
  it("returns the tool's own refusal unchanged", () => {
    const ours = new DesignMatchError('design-match: region "#root" nic neobsahuje');
    expect(translatePlaywrightError(ours)).toBe(ours);
  });
});
