# design-match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/design-match` skill that measures a Claude-artifact design mockup (structure + values) through Playwright and drives an implementation to structural and pixel parity in a bounded loop.

**Architecture:** The engine lives in `tools/design-match/` as plain `.mjs` modules (same pattern as `tools/docs-sync/`), invoked by a thin `SKILL.md` in `.claude/skills/design-match/`. Pure functions (skeleton normalisation, comparators, token mapping) are unit-tested under a new node-env vitest project; DOM extractors are integration-tested by driving real Chromium against a checked-in fixture HTML. The comparison is three-layered and ordered: a **blocking skeleton gate**, then computed-value deltas, then pixelmatch.

**Tech Stack:** Node ESM (`.mjs`), `@playwright/test`'s bundled `chromium`, `pixelmatch` + `pngjs`, vitest 2.1.8, Storybook 8.4.7 (`libs/design-system/.storybook`, port 6006).

**Spec:** `docs/superpowers/specs/2026-07-31-design-match-design.md`

## Global Constraints

- **Viewport:** 1440×900, `deviceScaleFactor: 2`. Identical on both sides — DPR is never mixed.
- **Loop bounds:** max 5 rounds; abort early if a round's pixel diff drops < 20 % relative; abort immediately if the skeleton gate fails twice.
- **Done:** skeleton gate passes **and** pixel diff < 0.5 % **and** no contiguous differing region > 4×4 px.
- **Order of checks is non-negotiable:** skeleton → values → pixels. The screenshot is not even taken when the skeleton gate fails.
- **Reuse of an existing DS component is a result, not a default** — it must pass the skeleton check against the design, using only its existing props.
- **New tokens are named semantically** by role (`--zt-fg-secondary`), never by hex (`--zt-fg-c9d4e8`).
- **Artifacts:** `.design-match/` at repo root, gitignored.
- **No network in unit tests.** CDN assets are cached to `.design-match/.cdn-cache/` before any test that needs them; fixtures used by tests are fully self-contained.
- **Browser tests live in their own vitest project** (operator decision, 2026-07-31, overriding the original single-project design). Tests that launch real Chromium are named `*.browser.test.mjs` and run under `tools/design-match/vitest.browser.config.ts`, which is **not** registered in `vitest.workspace.ts` — so repo-wide `pnpm test` and the default CI test step stay browser-free. They run via `pnpm test:browser`, wired as its own CI step so coverage is not lost. The unit project must `exclude` the browser glob, or every browser test would run twice.
- **Package manager is pnpm.** Never `npm` or `yarn`.
- **Wrapper normalisation default:** a node with no own box _and_ no layout mode collapses into its parent. Overridable with `--strict-wrappers`. (Left open in the spec; this is the chosen default and it is a documented knob, not a hidden behaviour.)

---

## File Structure

| File                                          | Responsibility                                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `tools/design-match/cli.mjs`                  | argv parsing, phase orchestration, exit codes. Thin.                                           |
| `tools/design-match/skeleton.mjs`             | `extractSkeleton` — serialisable in-page function producing the structural tree.               |
| `tools/design-match/normalize.mjs`            | `normalizeSkeleton` — wrapper collapsing, relative geometry, role inference. Pure.             |
| `tools/design-match/compare-skeleton.mjs`     | `compareSkeletons` → structured findings. Pure.                                                |
| `tools/design-match/measure.mjs`              | `extractValues` — in-page computed-style extraction over the whitelist.                        |
| `tools/design-match/compare-values.mjs`       | `compareValues` → per-node value deltas. Pure.                                                 |
| `tools/design-match/tokens.mjs`               | Parse DS tokens, map measured values, propose semantic names. Pure.                            |
| `tools/design-match/browser.mjs`              | Chromium launch, design load, font preflight.                                                  |
| `tools/design-match/cdn-cache.mjs`            | Download + rewrite CDN `<script>`/`<link>` refs.                                               |
| `tools/design-match/inventory.mjs`            | F1 candidate regions + preview crops.                                                          |
| `tools/design-match/pixels.mjs`               | pixelmatch wrapper → diff %, diff PNG, contiguous-region scan.                                 |
| `tools/design-match/shoot.mjs`                | App screenshot: Storybook story / seeded route / masked.                                       |
| `tools/design-match/report.mjs`               | Writes `skeleton.md`, `tokens.md`, `components.md`, `report.md`, `round-*.json`.               |
| `tools/design-match/vitest.config.ts`         | 7th vitest project, node env. Unit tests only — excludes the browser glob.                     |
| `tools/design-match/vitest.browser.config.ts` | Browser project: `*.browser.test.mjs`, real Chromium, long timeout. NOT in the workspace list. |
| `tools/design-match/fixtures/basic.html`      | Self-contained fixture: grid form + card. No network.                                          |
| `.claude/skills/design-match/SKILL.md`        | Operator-facing skill: when to use, how to invoke, how to read the artifacts.                  |

---

### Task 1: Scaffold, deps, vitest project

**Files:**

- Create: `tools/design-match/vitest.config.ts`
- Create: `tools/design-match/version.mjs`
- Create: `tools/design-match/version.test.mjs`
- Modify: `vitest.workspace.ts`
- Modify: `package.json` (devDependencies + `test` note)
- Modify: `.gitignore`

**Interfaces:**

- Consumes: nothing.
- Produces: `DESIGN_MATCH_VERSION: string` from `tools/design-match/version.mjs`; a vitest project named `design-match` so every later task has somewhere to put tests.

- [ ] **Step 1: Install the two new dependencies**

```bash
pnpm add -Dw pixelmatch@^6.0.0 pngjs@^7.0.0
```

- [ ] **Step 2: Add `.design-match/` to `.gitignore`**

Append near the other tool-scratch entries (after the `.cache/` block):

```gitignore
# design-match artifacts — measured specs, screenshots, diffs, round history.
# Regenerated per run and often large; the durable output is the committed code.
.design-match/
```

- [ ] **Step 3: Write the vitest project config**

Create `tools/design-match/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

/**
 * 7th project in the workspace. Node env: everything here is either a pure
 * function over JSON or a Playwright-driven integration test that brings its
 * own browser. No jsdom — jsdom does no layout, so a geometry assertion under
 * it would be meaningless.
 */
export default defineConfig({
  test: {
    name: "design-match",
    root: __dirname,
    environment: "node",
    include: ["**/*.test.mjs"],
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 4: Register the project**

In `vitest.workspace.ts`, add to the `projects` array after the last entry:

```ts
  "./tools/design-match/vitest.config.ts",
```

- [ ] **Step 5: Write the failing test**

Create `tools/design-match/version.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { DESIGN_MATCH_VERSION } from "./version.mjs";

describe("design-match scaffold", () => {
  it("exposes a semver version string", () => {
    expect(DESIGN_MATCH_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `pnpm exec vitest run --project design-match`
Expected: FAIL — `Failed to resolve import "./version.mjs"`.

- [ ] **Step 7: Write the minimal implementation**

Create `tools/design-match/version.mjs`:

```js
/** Bumped when the measurement format changes in a way that invalidates cached specs. */
export const DESIGN_MATCH_VERSION = "1.0.0";
```

- [ ] **Step 8: Run it and watch it pass**

Run: `pnpm exec vitest run --project design-match`
Expected: PASS, 1 test.

- [ ] **Step 9: Commit**

```bash
rtk git add tools/design-match vitest.workspace.ts package.json pnpm-lock.yaml .gitignore
rtk git commit -m "feat(design-match): scaffold engine, vitest project, pixel deps"
```

---

### Task 2: Skeleton normaliser

The heart of the structural gate. Pure: JSON in, JSON out. Written before the extractor so the extractor's output shape is pinned by tests first.

**Files:**

- Create: `tools/design-match/normalize.mjs`
- Test: `tools/design-match/normalize.test.mjs`

**Interfaces:**

- Consumes: `DESIGN_MATCH_VERSION` (not required, but the module lives alongside it).
- Produces:
  - `normalizeSkeleton(raw: RawNode, options?: { strictWrappers?: boolean }): SkelNode`
  - `RawNode = { tag, classes: string[], attrs: Record<string,string>, text: string, box: {x,y,w,h}, layout: {display, flexDirection, gridTemplateColumns, flexWrap, alignItems, order}, children: RawNode[] }`
  - `SkelNode = { role, tag, layout: {mode, direction, columns, wrap, align}, rel: {w, h, x, y}, children: SkelNode[] }`
  - `mode` is one of `"grid" | "flex-row" | "flex-column" | "block" | "inline"`.
  - `rel` values are fractions of the parent box, rounded to 3 decimals. The root's `rel` is `{w:1,h:1,x:0,y:0}`.

- [ ] **Step 1: Write the failing tests**

Create `tools/design-match/normalize.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { normalizeSkeleton } from "./normalize.mjs";

const node = (over = {}) => ({
  tag: "div",
  classes: [],
  attrs: {},
  text: "",
  box: { x: 0, y: 0, w: 100, h: 100 },
  layout: {
    display: "block",
    flexDirection: "row",
    gridTemplateColumns: "none",
    flexWrap: "nowrap",
    alignItems: "normal",
    order: 0,
  },
  children: [],
  ...over,
});

describe("normalizeSkeleton", () => {
  it("maps display + flex-direction to a single layout mode", () => {
    const grid = normalizeSkeleton(
      node({ layout: { ...node().layout, display: "grid", gridTemplateColumns: "1fr 1fr" } }),
    );
    expect(grid.layout.mode).toBe("grid");
    expect(grid.layout.columns).toBe(2);

    const col = normalizeSkeleton(
      node({ layout: { ...node().layout, display: "flex", flexDirection: "column" } }),
    );
    expect(col.layout.mode).toBe("flex-column");
  });

  it("expresses child geometry as a fraction of the parent", () => {
    const root = normalizeSkeleton(
      node({
        box: { x: 0, y: 0, w: 400, h: 200 },
        children: [node({ box: { x: 100, y: 50, w: 200, h: 100 } })],
      }),
    );
    expect(root.rel).toEqual({ w: 1, h: 1, x: 0, y: 0 });
    expect(root.children[0].rel).toEqual({ w: 0.5, h: 0.5, x: 0.25, y: 0.25 });
  });

  it("collapses a wrapper that has no own box and no layout mode", () => {
    const wrapper = node({
      box: { x: 0, y: 0, w: 400, h: 200 },
      children: [node({ tag: "label", box: { x: 0, y: 0, w: 400, h: 200 } })],
    });
    const root = normalizeSkeleton(
      node({ box: { x: 0, y: 0, w: 400, h: 200 }, children: [wrapper] }),
    );
    expect(root.children).toHaveLength(1);
    expect(root.children[0].tag).toBe("label");
  });

  it("collapses a chain of nested wrappers, not just the outermost one", () => {
    const inner = node({
      box: { x: 0, y: 0, w: 400, h: 200 },
      children: [node({ tag: "label", box: { x: 100, y: 50, w: 200, h: 100 } })],
    });
    const middle = node({ box: { x: 0, y: 0, w: 400, h: 200 }, children: [inner] });
    const root = normalizeSkeleton(
      node({ box: { x: 0, y: 0, w: 400, h: 200 }, children: [middle] }),
    );
    expect(root.children).toHaveLength(1);
    expect(root.children[0].tag).toBe("label");
    // rel is measured against the SURVIVING ancestor, not a removed wrapper
    expect(root.children[0].rel).toEqual({ w: 0.5, h: 0.5, x: 0.25, y: 0.25 });
  });

  it("keeps the whole wrapper chain when strictWrappers is on", () => {
    const wrapper = node({
      box: { x: 0, y: 0, w: 400, h: 200 },
      children: [node({ tag: "label", box: { x: 0, y: 0, w: 400, h: 200 } })],
    });
    const root = normalizeSkeleton(
      node({ box: { x: 0, y: 0, w: 400, h: 200 }, children: [wrapper] }),
      { strictWrappers: true },
    );
    expect(root.children[0].tag).toBe("div");
    expect(root.children[0].children[0].tag).toBe("label");
  });

  it("infers roles from tag and attributes", () => {
    const form = normalizeSkeleton(
      node({
        tag: "form",
        children: [
          node({ tag: "label", text: "E-mail" }),
          node({ tag: "input", attrs: { type: "email" } }),
          node({ tag: "button", text: "Odeslat" }),
        ],
      }),
    );
    expect(form.role).toBe("form");
    expect(form.children.map((c) => c.role)).toEqual(["label", "input", "action"]);
  });

  it("reorders children by CSS order when it differs from DOM order", () => {
    const root = normalizeSkeleton(
      node({
        layout: { ...node().layout, display: "flex" },
        children: [
          node({ tag: "b", layout: { ...node().layout, order: 2 } }),
          node({ tag: "a", layout: { ...node().layout, order: 1 } }),
        ],
      }),
    );
    expect(root.children.map((c) => c.tag)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm exec vitest run --project design-match normalize`
Expected: FAIL — cannot resolve `./normalize.mjs`.

- [ ] **Step 3: Implement**

Create `tools/design-match/normalize.mjs`:

```js
/**
 * Turns a raw DOM snapshot into the structural fingerprint the skeleton gate
 * compares. Everything here is pure so it can be unit-tested without a browser —
 * the browser's only job is to hand us `box` and `layout` numbers.
 */

const ROLE_BY_TAG = {
  form: "form",
  label: "label",
  input: "input",
  textarea: "input",
  select: "input",
  button: "action",
  a: "action",
  img: "image",
  svg: "icon",
  ul: "list",
  ol: "list",
  li: "list-item",
  table: "table",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
};

const round = (n) => Math.round(n * 1000) / 1000;

function layoutMode({ display, flexDirection }) {
  if (display === "grid" || display === "inline-grid") return "grid";
  if (display === "flex" || display === "inline-flex") {
    return flexDirection.startsWith("column") ? "flex-column" : "flex-row";
  }
  if (display.startsWith("inline")) return "inline";
  return "block";
}

function columnCount(gridTemplateColumns) {
  if (!gridTemplateColumns || gridTemplateColumns === "none") return 0;
  return gridTemplateColumns.trim().split(/\s+/).length;
}

function inferRole(raw) {
  const byTag = ROLE_BY_TAG[raw.tag];
  if (byTag) return byTag;
  if (raw.attrs.role) return raw.attrs.role;
  const hint = [...raw.classes, raw.attrs["data-role"] ?? ""].join(" ").toLowerCase();
  if (/\brow\b/.test(hint)) return "row";
  if (/\bcol(umn)?\b/.test(hint)) return "column";
  if (/\bcard\b/.test(hint)) return "card";
  if (raw.text && raw.children.length === 0) return "text";
  return "group";
}

/** A wrapper is a node that neither lays anything out nor occupies its own area. */
function isCollapsibleWrapper(raw, parentBox) {
  if (raw.children.length !== 1) return false;
  if (layoutMode(raw.layout) !== "block") return false;
  if (!parentBox) return false;
  const sameBox =
    Math.abs(raw.box.w - parentBox.w) < 1 &&
    Math.abs(raw.box.h - parentBox.h) < 1 &&
    Math.abs(raw.box.x - parentBox.x) < 1 &&
    Math.abs(raw.box.y - parentBox.y) < 1;
  return sameBox;
}

function relativeTo(box, parentBox) {
  if (!parentBox || parentBox.w === 0 || parentBox.h === 0) {
    return { w: 1, h: 1, x: 0, y: 0 };
  }
  return {
    w: round(box.w / parentBox.w),
    h: round(box.h / parentBox.h),
    x: round((box.x - parentBox.x) / parentBox.w),
    y: round((box.y - parentBox.y) / parentBox.h),
  };
}

/**
 * Walk down through EVERY consecutive collapsible wrapper, not just the first.
 * Real markup nests wrapper divs several deep; stopping after one level leaves
 * phantom nodes in the tree and the comparator reports a mismatch that is not real.
 */
function resolveThroughWrappers(child, parentBox, options) {
  let current = child;
  while (!options.strictWrappers && isCollapsibleWrapper(current, parentBox)) {
    current = current.children[0];
  }
  return current;
}

function build(raw, parentBox, options) {
  const children = [...raw.children].sort((a, b) => a.layout.order - b.layout.order);
  return {
    role: inferRole(raw),
    tag: raw.tag,
    layout: {
      mode: layoutMode(raw.layout),
      direction: raw.layout.flexDirection,
      columns: columnCount(raw.layout.gridTemplateColumns),
      wrap: raw.layout.flexWrap,
      align: raw.layout.alignItems,
    },
    rel: relativeTo(raw.box, parentBox),
    children: children.map((child) =>
      build(resolveThroughWrappers(child, raw.box, options), raw.box, options),
    ),
  };
}

export function normalizeSkeleton(raw, options = {}) {
  return build(raw, null, { strictWrappers: false, ...options });
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm exec vitest run --project design-match normalize`
Expected: PASS, 6 tests.

- [ ] **Step 5: Format, lint, commit**

```bash
pnpm exec prettier --write tools/design-match/normalize.mjs tools/design-match/normalize.test.mjs
rtk git add tools/design-match
rtk git commit -m "feat(design-match): skeleton normaliser with wrapper collapsing"
```

---

### Task 3: Skeleton comparator (the blocking gate)

**Files:**

- Create: `tools/design-match/compare-skeleton.mjs`
- Test: `tools/design-match/compare-skeleton.test.mjs`

**Interfaces:**

- Consumes: `SkelNode` from Task 2.
- Produces:
  - `compareSkeletons(design: SkelNode, app: SkelNode, options?: { sizeTolerance?: number }): SkeletonVerdict`
  - `SkeletonVerdict = { pass: boolean, findings: Finding[] }`
  - `Finding = { path: string, kind: "layout-mode" | "columns" | "child-count" | "child-order" | "size" | "role", expected: string|number, actual: string|number, message: string }`
  - `path` is a slash-joined role trail, e.g. `form/row[1]/input`.
  - `sizeTolerance` defaults to `0.02` (2 % of the parent box).

- [ ] **Step 1: Write the failing tests**

Create `tools/design-match/compare-skeleton.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { compareSkeletons } from "./compare-skeleton.mjs";

const leaf = (over = {}) => ({
  role: "text",
  tag: "span",
  layout: { mode: "block", direction: "row", columns: 0, wrap: "nowrap", align: "normal" },
  rel: { w: 1, h: 1, x: 0, y: 0 },
  children: [],
  ...over,
});

describe("compareSkeletons", () => {
  it("passes for identical trees", () => {
    const tree = leaf({
      role: "form",
      children: [leaf({ role: "label" }), leaf({ role: "input" })],
    });
    expect(compareSkeletons(tree, structuredClone(tree))).toEqual({ pass: true, findings: [] });
  });

  it("flags a different layout mode", () => {
    const design = leaf({ role: "form", layout: { ...leaf().layout, mode: "grid", columns: 2 } });
    const app = leaf({ role: "form", layout: { ...leaf().layout, mode: "flex-column" } });
    const verdict = compareSkeletons(design, app);
    expect(verdict.pass).toBe(false);
    expect(verdict.findings[0]).toMatchObject({
      kind: "layout-mode",
      expected: "grid",
      actual: "flex-column",
      path: "form",
    });
  });

  it("flags a differing child count", () => {
    const design = leaf({ role: "form", children: [leaf(), leaf(), leaf()] });
    const app = leaf({ role: "form", children: [leaf(), leaf()] });
    const verdict = compareSkeletons(design, app);
    expect(verdict.pass).toBe(false);
    expect(
      verdict.findings.some((f) => f.kind === "child-count" && f.expected === 3 && f.actual === 2),
    ).toBe(true);
  });

  it("flags children in a different order", () => {
    const design = leaf({
      role: "row",
      children: [leaf({ role: "label" }), leaf({ role: "input" })],
    });
    const app = leaf({ role: "row", children: [leaf({ role: "input" }), leaf({ role: "label" })] });
    const verdict = compareSkeletons(design, app);
    expect(verdict.pass).toBe(false);
    expect(verdict.findings.some((f) => f.kind === "child-order")).toBe(true);
  });

  it("flags an element that is materially smaller than the design", () => {
    const design = leaf({
      role: "card",
      children: [leaf({ role: "row", rel: { w: 0.48, h: 1, x: 0, y: 0 } })],
    });
    const app = leaf({
      role: "card",
      children: [leaf({ role: "row", rel: { w: 1, h: 1, x: 0, y: 0 } })],
    });
    const verdict = compareSkeletons(design, app);
    expect(verdict.pass).toBe(false);
    expect(verdict.findings.some((f) => f.kind === "size" && f.path === "card/row[0]")).toBe(true);
  });

  it("ignores sub-tolerance size differences", () => {
    const design = leaf({ role: "card", children: [leaf({ rel: { w: 0.5, h: 1, x: 0, y: 0 } })] });
    const app = leaf({ role: "card", children: [leaf({ rel: { w: 0.51, h: 1, x: 0, y: 0 } })] });
    expect(compareSkeletons(design, app).pass).toBe(true);
  });

  it("stops descending into a subtree whose child count already differs", () => {
    const design = leaf({
      role: "form",
      children: [leaf({ role: "row", children: [leaf(), leaf()] })],
    });
    const app = leaf({ role: "form", children: [] });
    const verdict = compareSkeletons(design, app);
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0].kind).toBe("child-count");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm exec vitest run --project design-match compare-skeleton`
Expected: FAIL — cannot resolve `./compare-skeleton.mjs`.

- [ ] **Step 3: Implement**

Create `tools/design-match/compare-skeleton.mjs`:

```js
/**
 * The blocking gate. Answers one question: "is this the same structure?" — not
 * "does it look the same". A failure here means the wrong component or the wrong
 * layout was chosen, which no amount of value tuning can fix, so the loop must
 * stop rather than proceed to pixels.
 */

const DEFAULT_SIZE_TOLERANCE = 0.02;

function childPath(parentPath, child, index) {
  return `${parentPath}/${child.role}[${index}]`;
}

function walk(design, app, path, tolerance, findings) {
  if (design.layout.mode !== app.layout.mode) {
    findings.push({
      path,
      kind: "layout-mode",
      expected: design.layout.mode,
      actual: app.layout.mode,
      message: `layout mód: ${design.layout.mode} vs ${app.layout.mode}`,
    });
    return; // everything below is being laid out by a different engine — descending adds noise
  }

  if (design.layout.mode === "grid" && design.layout.columns !== app.layout.columns) {
    findings.push({
      path,
      kind: "columns",
      expected: design.layout.columns,
      actual: app.layout.columns,
      message: `počet sloupců: ${design.layout.columns} vs ${app.layout.columns}`,
    });
  }

  if (design.children.length !== app.children.length) {
    findings.push({
      path,
      kind: "child-count",
      expected: design.children.length,
      actual: app.children.length,
      message: `počet potomků: ${design.children.length} vs ${app.children.length}`,
    });
    return; // pairing children is meaningless once the counts differ
  }

  const designRoles = design.children.map((c) => c.role).join(",");
  const appRoles = app.children.map((c) => c.role).join(",");
  if (designRoles !== appRoles) {
    findings.push({
      path,
      kind: "child-order",
      expected: designRoles,
      actual: appRoles,
      message: `pořadí/role potomků: [${designRoles}] vs [${appRoles}]`,
    });
    return;
  }

  design.children.forEach((designChild, index) => {
    const appChild = app.children[index];
    const here = childPath(path, designChild, index);
    for (const axis of ["w", "h"]) {
      const delta = Math.abs(designChild.rel[axis] - appChild.rel[axis]);
      if (delta > tolerance) {
        findings.push({
          path: here,
          kind: "size",
          expected: designChild.rel[axis],
          actual: appChild.rel[axis],
          message: `${axis === "w" ? "šířka" : "výška"} ${designChild.rel[axis]} rodiče v designu, ${appChild.rel[axis]} v implementaci`,
        });
      }
    }
    walk(designChild, appChild, here, tolerance, findings);
  });
}

export function compareSkeletons(design, app, options = {}) {
  const tolerance = options.sizeTolerance ?? DEFAULT_SIZE_TOLERANCE;
  const findings = [];
  walk(design, app, design.role, tolerance, findings);
  return { pass: findings.length === 0, findings };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm exec vitest run --project design-match compare-skeleton`
Expected: PASS, 7 tests.

Note: the "materially smaller" test expects path `card/row[0]` — `childPath` builds exactly that from the parent path `card` plus the child's role and index.

- [ ] **Step 5: Format and commit**

```bash
pnpm exec prettier --write tools/design-match/compare-skeleton.mjs tools/design-match/compare-skeleton.test.mjs
rtk git add tools/design-match
rtk git commit -m "feat(design-match): blocking skeleton comparator"
```

---

### Task 4: In-page extractors + fixture, driven by real Chromium

**Files:**

- Create: `tools/design-match/fixtures/basic.html`
- Create: `tools/design-match/extract.mjs`
- Create: `tools/design-match/browser.mjs`
- Create: `tools/design-match/vitest.browser.config.ts`
- Modify: `tools/design-match/vitest.config.ts` (add the browser `exclude`)
- Modify: `package.json` (add `test:browser`)
- Modify: `.github/workflows/ci.yml` (add the browser test step)
- Test: `tools/design-match/extract.browser.test.mjs`

**Interfaces:**

- Consumes: `normalizeSkeleton` (Task 2).
- Produces:
  - `browser.mjs`: `withPage(fn: (page) => Promise<T>): Promise<T>` — launches Chromium at 1440×900 DPR 2, always closes.
  - `extract.mjs`: `extractRaw(page, selector, depth?): Promise<RawNode>` returning the shape Task 2 consumes; plus `VALUE_PROPS: string[]` and `extractValues(page, selector, props?, depth?): Promise<Record<string, Record<string,string>>>` keyed by node path.

- [ ] **Step 0: Split browser tests into their own vitest project**

This task introduces the first test that launches real Chromium. Operator decision
(2026-07-31): browser tests must not run inside the default fast suite.

Create `tools/design-match/vitest.browser.config.ts`:

```ts
import { defineConfig } from "vitest/config";

/**
 * Browser-driven tests, deliberately OUTSIDE `vitest.workspace.ts`: repo-wide
 * `pnpm test` and the default CI test step must stay browser-free. These run via
 * `pnpm test:browser`, which CI invokes as its own step so the coverage is not lost.
 */
export default defineConfig({
  test: {
    name: "design-match-browser",
    root: __dirname,
    environment: "node",
    include: ["**/*.browser.test.mjs"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
```

In `tools/design-match/vitest.config.ts`, add the exclude next to `include` —
without it every browser test runs twice:

```ts
    include: ["**/*.test.mjs"],
    exclude: ["**/*.browser.test.mjs"],
```

In root `package.json`, add next to the existing `test` script:

```json
    "test:browser": "vitest run --config tools/design-match/vitest.browser.config.ts",
```

In `.github/workflows/ci.yml`, add a step immediately after the existing
`pnpm run test` step (match the surrounding step style — read the file first):

```yaml
- name: Browser-driven design-match tests
  run: pnpm run test:browser
```

The CI job must have Chromium available. If the workflow does not already
install Playwright browsers, add `pnpm exec playwright install --with-deps chromium`
as the step before it. Check the workflow before assuming either way, and say
which you found in your report.

- [ ] **Step 1: Create the fixture**

Create `tools/design-match/fixtures/basic.html` — fully self-contained, no network:

```html
<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: monospace;
        background: #0b0e13;
        color: #c9d4e8;
      }
      .card {
        width: 400px;
        padding: 24px;
        background: #11151d;
        border-radius: 8px;
      }
      .form {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .row {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
      }
      .row > label {
        width: 96px;
        font-size: 14px;
      }
      .row > input {
        flex: 1;
        height: 32px;
        background: #0b0e13;
        border: 1px solid #26303f;
      }
    </style>
  </head>
  <body>
    <div class="card" data-region="card">
      <form class="form">
        <div class="row"><label>Jméno</label><input type="text" /></div>
        <div class="row"><label>E-mail</label><input type="email" /></div>
        <div class="row"><label>Firma</label><input type="text" /></div>
        <div class="row"><label>Role</label><input type="text" /></div>
      </form>
    </div>
  </body>
</html>
```

- [ ] **Step 2: Write the failing test**

Create `tools/design-match/extract.browser.test.mjs`:

```js
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { withPage } from "./browser.mjs";
import { extractRaw, extractValues } from "./extract.mjs";
import { normalizeSkeleton } from "./normalize.mjs";

const fixture = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "basic.html"),
).href;

describe("extractors against real Chromium", () => {
  it("extracts a skeleton whose form is a 2-column grid with four rows", async () => {
    const skeleton = await withPage(async (page) => {
      await page.goto(fixture);
      return normalizeSkeleton(await extractRaw(page, '[data-region="card"]'));
    });

    const form = skeleton.children[0];
    expect(form.role).toBe("form");
    expect(form.layout.mode).toBe("grid");
    expect(form.layout.columns).toBe(2);
    expect(form.children).toHaveLength(4);
    expect(form.children[0].children.map((c) => c.role)).toEqual(["label", "input"]);
  });

  it("extracts computed values including the exact background", async () => {
    const values = await withPage(async (page) => {
      await page.goto(fixture);
      return extractValues(page, '[data-region="card"]');
    });

    expect(values.card.backgroundColor).toBe("rgb(17, 21, 29)");
    expect(values.card.paddingTop).toBe("24px");
    expect(values["card/form[0]"].gap).toBe("12px");
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `pnpm exec vitest run --config tools/design-match/vitest.browser.config.ts extract`
Expected: FAIL — cannot resolve `./browser.mjs`.

- [ ] **Step 4: Implement the browser helper**

Create `tools/design-match/browser.mjs`:

```js
import { chromium } from "@playwright/test";

export const VIEWPORT = { width: 1440, height: 900 };
export const DEVICE_SCALE_FACTOR = 2;

/**
 * One place that owns viewport and DPR, so the design side and the app side can
 * never drift apart — a mixed DPR silently poisons every pixel comparison.
 */
export async function withPage(fn) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });
    const page = await context.newPage();
    return await fn(page);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 5: Implement the extractors**

Create `tools/design-match/extract.mjs`:

```js
/**
 * Everything in here runs inside the page. The functions are passed to
 * `page.evaluate` as source, so they must not close over anything from module
 * scope — hence the arguments-in, JSON-out shape.
 */

/** Deliberately narrow: ~40 properties that carry visual meaning, not all ~340. */
export const VALUE_PROPS = [
  "display",
  "position",
  "boxSizing",
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "gap",
  "rowGap",
  "columnGap",
  "flexDirection",
  "flexWrap",
  "alignItems",
  "justifyContent",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "gridTemplateColumns",
  "gridTemplateRows",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textTransform",
  "textAlign",
  "color",
  "backgroundColor",
  "backgroundImage",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderColor",
  "borderStyle",
  "borderRadius",
  "boxShadow",
  "opacity",
  "transform",
  "backdropFilter",
  "mixBlendMode",
];

/** Snapshot the raw tree in the shape `normalizeSkeleton` consumes. */
export async function extractRaw(page, selector, depth = 6) {
  return page.evaluate(
    ({ selector, depth }) => {
      const visible = (el) => {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")
          return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const snap = (el, level) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const ownText = [...el.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent.trim())
          .join(" ")
          .trim();
        return {
          tag: el.tagName.toLowerCase(),
          classes: [...el.classList],
          attrs: Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])),
          text: ownText,
          box: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          layout: {
            display: style.display,
            flexDirection: style.flexDirection,
            gridTemplateColumns: style.gridTemplateColumns,
            flexWrap: style.flexWrap,
            alignItems: style.alignItems,
            order: Number(style.order) || 0,
          },
          children:
            level >= depth
              ? []
              : [...el.children].filter(visible).map((child) => snap(child, level + 1)),
        };
      };

      const root = document.querySelector(selector);
      if (!root) throw new Error(`design-match: selector not found: ${selector}`);
      return snap(root, 0);
    },
    { selector, depth },
  );
}

/**
 * Values keyed by the same path shape the skeleton comparator uses, so a value
 * delta can be pointed at the node the structural gate already named.
 */
export async function extractValues(page, selector, props = VALUE_PROPS, depth = 6) {
  return page.evaluate(
    ({ selector, props, depth }) => {
      const ROLE_BY_TAG = {
        form: "form",
        label: "label",
        input: "input",
        textarea: "input",
        select: "input",
        button: "action",
        a: "action",
        img: "image",
        svg: "icon",
        ul: "list",
        ol: "list",
        li: "list-item",
        table: "table",
        h1: "heading",
        h2: "heading",
        h3: "heading",
        h4: "heading",
      };
      const roleOf = (el) => {
        const byTag = ROLE_BY_TAG[el.tagName.toLowerCase()];
        if (byTag) return byTag;
        if (el.getAttribute("role")) return el.getAttribute("role");
        const hint = [...el.classList].join(" ").toLowerCase();
        if (/\brow\b/.test(hint)) return "row";
        if (/\bcol(umn)?\b/.test(hint)) return "column";
        if (/\bcard\b/.test(hint)) return "card";
        return "group";
      };
      const visible = (el) => {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")
          return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const out = {};
      const walk = (el, path, level) => {
        const style = getComputedStyle(el);
        out[path] = Object.fromEntries(props.map((p) => [p, style[p]]));
        if (level >= depth) return;
        [...el.children].filter(visible).forEach((child, index) => {
          walk(child, `${path}/${roleOf(child)}[${index}]`, level + 1);
        });
      };

      const root = document.querySelector(selector);
      if (!root) throw new Error(`design-match: selector not found: ${selector}`);
      walk(root, roleOf(root), 0);
      return out;
    },
    { selector, props, depth },
  );
}
```

- [ ] **Step 6: Run and watch it pass**

Run: `pnpm exec vitest run --config tools/design-match/vitest.browser.config.ts extract`
Expected: PASS, 2 tests. If Chromium is missing: `pnpm exec playwright install chromium`.

- [ ] **Step 7: Format and commit**

```bash
pnpm exec prettier --write tools/design-match/browser.mjs tools/design-match/extract.mjs tools/design-match/extract.browser.test.mjs
rtk git add tools/design-match
rtk git commit -m "feat(design-match): in-page skeleton and value extractors"
```

---

### Task 5: Value comparator

**Files:**

- Create: `tools/design-match/compare-values.mjs`
- Test: `tools/design-match/compare-values.test.mjs`

**Interfaces:**

- Consumes: the `Record<path, Record<prop, string>>` shape from `extractValues` (Task 4).
- Produces: `compareValues(design, app): ValueDelta[]` where
  `ValueDelta = { path, prop, expected, actual, message }`. Paths present in the design but missing in the app produce a single `{ prop: "__missing__" }` delta for that path.

- [ ] **Step 1: Write the failing tests**

Create `tools/design-match/compare-values.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { compareValues } from "./compare-values.mjs";

describe("compareValues", () => {
  it("returns nothing for identical values", () => {
    const v = { card: { gap: "12px", color: "rgb(1, 2, 3)" } };
    expect(compareValues(v, structuredClone(v))).toEqual([]);
  });

  it("reports a per-property delta with both sides", () => {
    const deltas = compareValues({ card: { gap: "16px" } }, { card: { gap: "12px" } });
    expect(deltas).toEqual([
      {
        path: "card",
        prop: "gap",
        expected: "16px",
        actual: "12px",
        message: "card: gap 16px vs 12px",
      },
    ]);
  });

  it("reports a missing node once, not once per property", () => {
    const deltas = compareValues({ "card/row[0]": { gap: "8px", color: "red" } }, {});
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ path: "card/row[0]", prop: "__missing__" });
  });

  it("ignores nodes the app has beyond the design", () => {
    expect(
      compareValues({ card: { gap: "8px" } }, { card: { gap: "8px" }, extra: { gap: "0px" } }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm exec vitest run --project design-match compare-values`
Expected: FAIL — cannot resolve `./compare-values.mjs`.

- [ ] **Step 3: Implement**

Create `tools/design-match/compare-values.mjs`:

```js
/**
 * Value layer — only ever consulted once the skeleton gate has passed, so a
 * delta here is always "right structure, wrong number" and directly actionable.
 */
export function compareValues(design, app) {
  const deltas = [];
  for (const [path, props] of Object.entries(design)) {
    const appProps = app[path];
    if (!appProps) {
      deltas.push({
        path,
        prop: "__missing__",
        expected: "node exists",
        actual: "chybí",
        message: `${path}: uzel v implementaci chybí`,
      });
      continue;
    }
    for (const [prop, expected] of Object.entries(props)) {
      const actual = appProps[prop];
      if (actual !== expected) {
        deltas.push({
          path,
          prop,
          expected,
          actual,
          message: `${path}: ${prop} ${expected} vs ${actual}`,
        });
      }
    }
  }
  return deltas;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm exec vitest run --project design-match compare-values`
Expected: PASS, 4 tests.

- [ ] **Step 5: Format and commit**

```bash
pnpm exec prettier --write tools/design-match/compare-values.mjs tools/design-match/compare-values.test.mjs
rtk git add tools/design-match
rtk git commit -m "feat(design-match): value comparator"
```

---

### Task 6: Token mapping

**Files:**

- Create: `tools/design-match/tokens.mjs`
- Test: `tools/design-match/tokens.test.mjs`

**Interfaces:**

- Consumes: raw CSS text of `libs/design-system/src/theme/globals.css`.
- Produces:
  - `parseThemeTokens(css: string): Token[]` where `Token = { name: string, value: string }` — only declarations inside `@theme` blocks.
  - `mapValue(value: string, tokens: Token[]): Mapping` where
    `Mapping = { kind: "exact", token: string } | { kind: "new", nearest: string|null, distance: number|null, proposedName: string|null }`.
  - `proposeTokenName(role: string, prop: string): string` — semantic, never hex-based.
  - Colour distance is CIE76 ΔE over sRGB→Lab; length distance is absolute px.

- [ ] **Step 1: Write the failing tests**

Create `tools/design-match/tokens.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { mapValue, parseThemeTokens, proposeTokenName } from "./tokens.mjs";

const CSS = `
@theme {
  --zt-bg-base: #0b0e13;
  --zt-accent: #5b8def;
  --zt-space-3: 12px;
}
.not-a-theme { --zt-ignored: #fff; }
`;

describe("parseThemeTokens", () => {
  it("reads only declarations inside @theme", () => {
    const tokens = parseThemeTokens(CSS);
    expect(tokens.map((t) => t.name)).toEqual(["--zt-bg-base", "--zt-accent", "--zt-space-3"]);
  });
});

describe("mapValue", () => {
  const tokens = parseThemeTokens(CSS);

  it("returns an exact match for a colour already in the theme", () => {
    expect(mapValue("rgb(11, 14, 19)", tokens)).toEqual({ kind: "exact", token: "--zt-bg-base" });
  });

  it("returns an exact match for a length already in the theme", () => {
    expect(mapValue("12px", tokens)).toEqual({ kind: "exact", token: "--zt-space-3" });
  });

  it("proposes a new token and names the nearest existing one with its distance", () => {
    const mapping = mapValue("rgb(201, 212, 232)", tokens);
    expect(mapping.kind).toBe("new");
    expect(mapping.nearest).toBe("--zt-accent");
    expect(mapping.distance).toBeGreaterThan(2);
  });

  it("measures length distance in px", () => {
    const mapping = mapValue("18px", tokens);
    expect(mapping).toMatchObject({ kind: "new", nearest: "--zt-space-3", distance: 6 });
  });
});

describe("proposeTokenName", () => {
  it("names by role and property, never by hex", () => {
    expect(proposeTokenName("text-secondary", "color")).toBe("--zt-fg-text-secondary");
    expect(proposeTokenName("card", "backgroundColor")).toBe("--zt-bg-card");
    expect(proposeTokenName("row", "gap")).toBe("--zt-space-row");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm exec vitest run --project design-match tokens`
Expected: FAIL — cannot resolve `./tokens.mjs`.

- [ ] **Step 3: Implement**

Create `tools/design-match/tokens.mjs`:

```js
/**
 * Decision 3 of the spec: the design is the truth, so an unmatched value becomes
 * a NEW token. This module's job is to make that growth legible — every new
 * token is reported next to its nearest existing neighbour and the distance, and
 * it is named by role, never by hex.
 */

const PROP_PREFIX = {
  color: "fg",
  backgroundColor: "bg",
  borderColor: "border",
  gap: "space",
  rowGap: "space",
  columnGap: "space",
  paddingTop: "space",
  paddingLeft: "space",
  borderRadius: "radius",
  boxShadow: "shadow",
  fontSize: "text",
  lineHeight: "leading",
  letterSpacing: "tracking",
};

export function parseThemeTokens(css) {
  const tokens = [];
  const themeBlock = /@theme[^{]*\{([\s\S]*?)\}/g;
  let block;
  while ((block = themeBlock.exec(css)) !== null) {
    const decl = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let match;
    while ((match = decl.exec(block[1])) !== null) {
      tokens.push({ name: match[1], value: match[2].trim() });
    }
  }
  return tokens;
}

function parseColor(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const int = Number.parseInt(hex[1], 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(value.trim());
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

function parseLength(value) {
  const px = /^(-?[\d.]+)px$/.exec(value.trim());
  return px ? Number(px[1]) : null;
}

function toLab([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a, b) {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

const round = (n) => Math.round(n * 10) / 10;

export function mapValue(value, tokens) {
  const color = parseColor(value);
  const length = parseLength(value);

  const candidates = tokens
    .map((token) => {
      if (color) {
        const tokenColor = parseColor(token.value);
        return tokenColor ? { token, distance: round(deltaE(color, tokenColor)) } : null;
      }
      if (length !== null) {
        const tokenLength = parseLength(token.value);
        return tokenLength !== null
          ? { token, distance: round(Math.abs(length - tokenLength)) }
          : null;
      }
      return token.value === value ? { token, distance: 0 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);

  const best = candidates[0];
  if (best && best.distance === 0) return { kind: "exact", token: best.token.name };
  return {
    kind: "new",
    nearest: best ? best.token.name : null,
    distance: best ? best.distance : null,
    proposedName: null,
  };
}

export function proposeTokenName(role, prop) {
  const prefix = PROP_PREFIX[prop] ?? "misc";
  return `--zt-${prefix}-${role}`;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm exec vitest run --project design-match tokens`
Expected: PASS, 6 tests.

- [ ] **Step 5: Format and commit**

```bash
pnpm exec prettier --write tools/design-match/tokens.mjs tools/design-match/tokens.test.mjs
rtk git add tools/design-match
rtk git commit -m "feat(design-match): DS token parsing and value mapping"
```

---

### Task 7: Pixel diff with contiguous-region scan

**Files:**

- Create: `tools/design-match/pixels.mjs`
- Test: `tools/design-match/pixels.test.mjs`

**Interfaces:**

- Consumes: two PNG buffers.
- Produces: `diffPngs(designBuf: Buffer, appBuf: Buffer, options?: { threshold?: number }): PixelVerdict` where
  `PixelVerdict = { percent: number, diffBuffer: Buffer, largestRegion: { w: number, h: number } }`.
  Mismatched dimensions throw with both sizes named. `threshold` defaults to `0.1` (pixelmatch's per-pixel colour threshold).

- [ ] **Step 1: Write the failing tests**

Create `tools/design-match/pixels.test.mjs`:

```js
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { diffPngs } from "./pixels.mjs";

function png(width, height, paint) {
  const image = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (width * y + x) << 2;
      const [r, g, b] = paint(x, y);
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(image);
}

const black = () => [0, 0, 0];

describe("diffPngs", () => {
  it("reports zero for identical images", () => {
    const buf = png(20, 20, black);
    const verdict = diffPngs(buf, Buffer.from(buf));
    expect(verdict.percent).toBe(0);
    expect(verdict.largestRegion).toEqual({ w: 0, h: 0 });
  });

  it("measures the largest contiguous differing region", () => {
    const a = png(20, 20, black);
    const b = png(20, 20, (x, y) =>
      x >= 4 && x < 10 && y >= 4 && y < 9 ? [255, 0, 0] : [0, 0, 0],
    );
    const verdict = diffPngs(a, b);
    expect(verdict.percent).toBeGreaterThan(0);
    expect(verdict.largestRegion).toEqual({ w: 6, h: 5 });
  });

  it("throws when the dimensions differ, naming both", () => {
    expect(() => diffPngs(png(10, 10, black), png(12, 10, black))).toThrow(/10×10.*12×10/);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm exec vitest run --project design-match pixels`
Expected: FAIL — cannot resolve `./pixels.mjs`.

- [ ] **Step 3: Implement**

Create `tools/design-match/pixels.mjs`:

```js
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/**
 * The largest contiguous differing region matters more than the raw percentage:
 * 0.4 % spread as antialiasing is noise, 0.4 % concentrated in one 40×30 block
 * is a real visual defect. The done-condition uses both.
 */
function largestDifferingRegion(diff, width, height) {
  const differs = (x, y) =>
    diff.data[((width * y + x) << 2) + 0] > 0 || diff.data[((width * y + x) << 2) + 1] > 0;
  const seen = new Uint8Array(width * height);
  let best = { w: 0, h: 0 };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (seen[width * y + x] || !differs(x, y)) continue;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const stack = [[x, y]];
      seen[width * y + x] = 1;
      while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (seen[width * ny + nx] || !differs(nx, ny)) continue;
          seen[width * ny + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      if (w * h > best.w * best.h) best = { w, h };
    }
  }
  return best;
}

export function diffPngs(designBuf, appBuf, options = {}) {
  const design = PNG.sync.read(designBuf);
  const app = PNG.sync.read(appBuf);
  if (design.width !== app.width || design.height !== app.height) {
    throw new Error(
      `design-match: rozměry se liší — design ${design.width}×${design.height}, app ${app.width}×${app.height}`,
    );
  }
  const diff = new PNG({ width: design.width, height: design.height });
  const differing = pixelmatch(design.data, app.data, diff.data, design.width, design.height, {
    threshold: options.threshold ?? 0.1,
  });
  return {
    percent: Math.round((differing / (design.width * design.height)) * 10000) / 100,
    diffBuffer: PNG.sync.write(diff),
    largestRegion:
      differing === 0 ? { w: 0, h: 0 } : largestDifferingRegion(diff, design.width, design.height),
  };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm exec vitest run --project design-match pixels`
Expected: PASS, 3 tests.

- [ ] **Step 5: Format and commit**

```bash
pnpm exec prettier --write tools/design-match/pixels.mjs tools/design-match/pixels.test.mjs
rtk git add tools/design-match
rtk git commit -m "feat(design-match): pixel diff with contiguous-region scan"
```

---

### Task 8: CDN cache and font preflight

**Files:**

- Create: `tools/design-match/cdn-cache.mjs`
- Create: `tools/design-match/preflight.mjs`
- Test: `tools/design-match/preflight.test.mjs`

**Interfaces:**

- Consumes: `withPage` (Task 4).
- Produces:
  - `rewriteToCache(html: string, manifest: Record<string,string>): string` — swaps absolute `http(s)` `src`/`href` for local cache paths. Pure.
  - `collectRemoteUrls(html: string): string[]` — pure.
  - `ensureCdnCache(htmlPath: string, cacheDir: string): Promise<{ localHtmlPath: string, downloaded: string[] }>`
  - `fontPreflight(designFonts: string[], appFonts: string[]): { ok: boolean, message: string }`

- [ ] **Step 1: Write the failing tests**

Create `tools/design-match/preflight.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { collectRemoteUrls, rewriteToCache } from "./cdn-cache.mjs";
import { fontPreflight } from "./preflight.mjs";

const HTML = `
<link href="https://fonts.googleapis.com/css2?family=Geist" rel="stylesheet" />
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
<script type="text/babel" src="zibby/data.jsx"></script>
`;

describe("collectRemoteUrls", () => {
  it("finds absolute urls and ignores relative ones", () => {
    expect(collectRemoteUrls(HTML)).toEqual([
      "https://fonts.googleapis.com/css2?family=Geist",
      "https://unpkg.com/react@18.3.1/umd/react.development.js",
    ]);
  });
});

describe("rewriteToCache", () => {
  it("swaps only the urls present in the manifest", () => {
    const out = rewriteToCache(HTML, {
      "https://unpkg.com/react@18.3.1/umd/react.development.js": ".cdn-cache/react.js",
    });
    expect(out).toContain('src=".cdn-cache/react.js"');
    expect(out).toContain("https://fonts.googleapis.com/css2?family=Geist");
    expect(out).toContain('src="zibby/data.jsx"');
  });
});

describe("fontPreflight", () => {
  it("passes when both sides resolve the same families", () => {
    expect(fontPreflight(["Geist", "JetBrains Mono"], ["Geist", "JetBrains Mono"])).toEqual({
      ok: true,
      message: "font stack shodný: Geist, JetBrains Mono",
    });
  });

  it("fails and names both stacks when they differ", () => {
    const result = fontPreflight(["Geist"], ["Inter"]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Geist");
    expect(result.message).toContain("Inter");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm exec vitest run --project design-match preflight`
Expected: FAIL — cannot resolve `./cdn-cache.mjs`.

- [ ] **Step 3: Implement the CDN cache**

Create `tools/design-match/cdn-cache.mjs`:

```js
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const REMOTE_ATTR = /\b(src|href)="(https?:\/\/[^"]+)"/g;

export function collectRemoteUrls(html) {
  return [...html.matchAll(REMOTE_ATTR)].map((m) => m[2]);
}

export function rewriteToCache(html, manifest) {
  return html.replace(REMOTE_ATTR, (whole, attr, url) =>
    manifest[url] ? `${attr}="${manifest[url]}"` : whole,
  );
}

const cacheName = (url) =>
  `${createHash("sha1").update(url).digest("hex").slice(0, 12)}${path.extname(new URL(url).pathname) || ".txt"}`;

/**
 * Mockups pull React, Babel and three.js from CDNs. Without network they render
 * nothing — and an empty screenshot looks like valid input, which is the worst
 * possible failure mode. Cache once, rewrite, then never touch the network again.
 */
export async function ensureCdnCache(htmlPath, cacheDir) {
  const html = await fs.readFile(htmlPath, "utf8");
  const urls = [...new Set(collectRemoteUrls(html))];
  await fs.mkdir(cacheDir, { recursive: true });

  const manifest = {};
  const downloaded = [];
  for (const url of urls) {
    const file = path.join(cacheDir, cacheName(url));
    try {
      await fs.access(file);
    } catch {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `design-match: nelze stáhnout ${url} (HTTP ${response.status}). Bez cache se mockup nevykreslí.`,
        );
      }
      await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
      downloaded.push(url);
    }
    manifest[url] = path.relative(path.dirname(htmlPath), file);
  }

  const localHtmlPath = path.join(
    path.dirname(htmlPath),
    `.design-match-cached-${path.basename(htmlPath)}`,
  );
  await fs.writeFile(localHtmlPath, rewriteToCache(html, manifest), "utf8");
  return { localHtmlPath, downloaded };
}
```

- [ ] **Step 4: Implement the font preflight**

Create `tools/design-match/preflight.mjs`:

```js
const normalise = (families) => families.map((f) => f.replace(/["']/g, "").trim()).filter(Boolean);

/**
 * Stops the loop in F1 rather than in round five. A font mismatch makes every
 * later pixel delta a lie: the numbers move, but the cause is not in the code.
 */
export function fontPreflight(designFonts, appFonts) {
  const design = normalise(designFonts);
  const app = normalise(appFonts);
  if (design.join(", ") === app.join(", ")) {
    return { ok: true, message: `font stack shodný: ${design.join(", ")}` };
  }
  return {
    ok: false,
    message: `font stack se liší — design: [${design.join(", ")}], implementace: [${app.join(", ")}]. Sjednoť je dřív, než se začne porovnávat.`,
  };
}
```

- [ ] **Step 5: Run and watch it pass**

Run: `pnpm exec vitest run --project design-match preflight`
Expected: PASS, 4 tests.

- [ ] **Step 6: Format and commit**

```bash
pnpm exec prettier --write tools/design-match/cdn-cache.mjs tools/design-match/preflight.mjs tools/design-match/preflight.test.mjs
rtk git add tools/design-match
rtk git commit -m "feat(design-match): CDN cache and font preflight"
```

---

### Task 9: Region inventory (F1)

**Files:**

- Create: `tools/design-match/inventory.mjs`
- Test: `tools/design-match/inventory.test.mjs` (pure — `rankCandidates`)
- Test: `tools/design-match/inventory.browser.test.mjs` (Chromium — `collectRegions`)

**Interfaces:**

- Consumes: `withPage` (Task 4), the `basic.html` fixture (Task 4).
- Produces:
  - `rankCandidates(regions: Region[], description: string): Region[]` — pure, sorted best-first.
    `Region = { selector, tag, classes: string[], text: string, box: {x,y,w,h} }`
  - `collectRegions(page): Promise<Region[]>` — visible elements ≥ 24×24 px, `html`/`body` excluded.
  - `cropRegions(page, regions, outDir, limit = 5): Promise<string[]>` — writes `r1.png`…`rN.png`, returns paths.

- [ ] **Step 1: Write the failing tests**

Two files — the pure ranking tests and the Chromium-driven collection test are
separate projects now (see Global Constraints).

Create `tools/design-match/inventory.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { rankCandidates } from "./inventory.mjs";

describe("rankCandidates", () => {
  const regions = [
    {
      selector: ".card",
      tag: "div",
      classes: ["card"],
      text: "",
      box: { x: 0, y: 0, w: 400, h: 300 },
    },
    {
      selector: ".row",
      tag: "div",
      classes: ["row"],
      text: "Jméno",
      box: { x: 0, y: 0, w: 200, h: 40 },
    },
    {
      selector: "form",
      tag: "form",
      classes: ["form"],
      text: "",
      box: { x: 0, y: 0, w: 380, h: 260 },
    },
  ];

  it("ranks by class-name match first", () => {
    expect(rankCandidates(regions, "karta")[0].selector).toBe(".card");
  });

  it("matches on text content too", () => {
    expect(rankCandidates(regions, "jméno")[0].selector).toBe(".row");
  });

  it("falls back to the largest region when nothing matches", () => {
    expect(rankCandidates(regions, "naprosto nesouvisející")[0].selector).toBe(".card");
  });
});
```

Create `tools/design-match/inventory.browser.test.mjs`:

```js
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { withPage } from "./browser.mjs";
import { collectRegions } from "./inventory.mjs";

const fixture = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "basic.html"),
).href;

describe("collectRegions", () => {
  it("excludes html/body and anything under 24×24", async () => {
    const regions = await withPage(async (page) => {
      await page.goto(fixture);
      return collectRegions(page);
    });
    expect(regions.some((r) => r.tag === "body")).toBe(false);
    expect(regions.every((r) => r.box.w >= 24 && r.box.h >= 24)).toBe(true);
    expect(regions.some((r) => r.classes.includes("card"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run both:
`pnpm exec vitest run --project design-match inventory`
`pnpm exec vitest run --config tools/design-match/vitest.browser.config.ts inventory`
Expected: FAIL in both — cannot resolve `./inventory.mjs`.

- [ ] **Step 3: Implement**

Create `tools/design-match/inventory.mjs`:

```js
import fs from "node:fs/promises";
import path from "node:path";

const MIN_SIDE = 24;

/** Accent-insensitive lowercase, so "Jméno" matches "jmeno" and "jméno". */
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function rankCandidates(regions, description) {
  const terms = fold(description).split(/\s+/).filter(Boolean);
  const scored = regions.map((region) => {
    const haystack = fold([region.tag, ...region.classes, region.text].join(" "));
    const hits = terms.filter((t) => haystack.includes(t)).length;
    return { region, hits, area: region.box.w * region.box.h };
  });
  return scored.sort((a, b) => b.hits - a.hits || b.area - a.area).map((s) => s.region);
}

export async function collectRegions(page) {
  return page.evaluate(
    ({ minSide }) => {
      const cssPath = (el) => {
        if (el.id) return `#${el.id}`;
        const classes = [...el.classList];
        if (classes.length > 0) return `.${classes.join(".")}`;
        const parent = el.parentElement;
        const index = parent ? [...parent.children].indexOf(el) + 1 : 1;
        return `${el.tagName.toLowerCase()}:nth-child(${index})`;
      };
      const out = [];
      for (const el of document.querySelectorAll("*")) {
        const tag = el.tagName.toLowerCase();
        if (tag === "html" || tag === "body" || tag === "script" || tag === "style") continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < minSide || rect.height < minSide) continue;
        out.push({
          selector: cssPath(el),
          tag,
          classes: [...el.classList],
          text: (el.textContent ?? "").trim().slice(0, 120),
          box: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        });
      }
      return out;
    },
    { minSide: MIN_SIDE },
  );
}

export async function cropRegions(page, regions, outDir, limit = 5) {
  await fs.mkdir(outDir, { recursive: true });
  const written = [];
  for (const [index, region] of regions.slice(0, limit).entries()) {
    const file = path.join(outDir, `r${index + 1}.png`);
    await page.screenshot({
      path: file,
      clip: { x: region.box.x, y: region.box.y, width: region.box.w, height: region.box.h },
    });
    written.push(file);
  }
  return written;
}

export function formatInventory(regions, limit = 5) {
  const lines = ["Inventura regionů (1440×900):"];
  regions.slice(0, limit).forEach((region, index) => {
    const size = `${Math.round(region.box.w)}×${Math.round(region.box.h)}`;
    const at = `(${Math.round(region.box.x)},${Math.round(region.box.y)})`;
    lines.push(
      `  [${index + 1}] ${region.selector.padEnd(24)} ${size.padStart(9)} @ ${at}   ▸ r${index + 1}.png`,
    );
  });
  return lines.join("\n");
}
```

- [ ] **Step 4: Run and watch it pass**

Run both:
`pnpm exec vitest run --project design-match inventory` — PASS, 3 tests
`pnpm exec vitest run --config tools/design-match/vitest.browser.config.ts inventory` — PASS, 1 test

- [ ] **Step 5: Format and commit**

```bash
pnpm exec prettier --write tools/design-match/inventory.mjs tools/design-match/inventory.test.mjs tools/design-match/inventory.browser.test.mjs
rtk git add tools/design-match
rtk git commit -m "feat(design-match): region inventory and preview crops"
```

---

### Task 10: Scene shooting — Storybook, seeded route, mask

**Files:**

- Create: `tools/design-match/shoot.mjs`
- Test: `tools/design-match/shoot.test.mjs`
- Create: `.claude/skills/design-match/references/scene-recipes.md`

**Interfaces:**

- Consumes: `withPage` (Task 4).
- Produces:
  - `storybookUrl(storyId: string, base = "http://localhost:6006"): string`
  - `resolveScene(options): Scene` where `Scene = { mode: "story"|"route"|"mask", url: string, selector: string, masks: string[] }`. Throws when neither `--story` nor `--route` is given.
  - `shootScene(page, scene, outPath): Promise<Buffer>` — screenshots `scene.selector`, applying `scene.masks` as Playwright mask locators.

- [ ] **Step 1: Write the failing tests**

Create `tools/design-match/shoot.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { resolveScene, storybookUrl } from "./shoot.mjs";

describe("storybookUrl", () => {
  it("builds an iframe url so the Storybook chrome is not in the shot", () => {
    expect(storybookUrl("components-button--primary")).toBe(
      "http://localhost:6006/iframe.html?id=components-button--primary&viewMode=story",
    );
  });
});

describe("resolveScene", () => {
  it("prefers the story mode when a story id is given", () => {
    const scene = resolveScene({ story: "ds-card--default", selector: "#storybook-root > *" });
    expect(scene.mode).toBe("story");
    expect(scene.url).toContain("id=ds-card--default");
  });

  it("uses the route mode with the app base url", () => {
    const scene = resolveScene({ route: "/roadmap", selector: "[data-region=card]" });
    expect(scene).toMatchObject({ mode: "route", url: "http://localhost:3000/roadmap" });
  });

  it("switches to mask mode when masks are supplied and records them", () => {
    const scene = resolveScene({ route: "/roadmap", selector: "main", masks: [".relative-time"] });
    expect(scene.mode).toBe("mask");
    expect(scene.masks).toEqual([".relative-time"]);
  });

  it("throws when neither story nor route is given", () => {
    expect(() => resolveScene({ selector: "main" })).toThrow(/--story|--route/);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm exec vitest run --project design-match shoot`
Expected: FAIL — cannot resolve `./shoot.mjs`.

- [ ] **Step 3: Implement**

Create `tools/design-match/shoot.mjs`:

```js
export const STORYBOOK_BASE = "http://localhost:6006";
export const APP_BASE = "http://localhost:3000";

export function storybookUrl(storyId, base = STORYBOOK_BASE) {
  return `${base}/iframe.html?id=${storyId}&viewMode=story`;
}

/**
 * Scene selection follows the spec's C → A → B preference: an isolated story
 * where the unit can stand alone, a seeded route where page composition is the
 * thing under test, masking only where state cannot be made deterministic.
 */
export function resolveScene(options) {
  const masks = options.masks ?? [];
  if (options.story) {
    return { mode: "story", url: storybookUrl(options.story), selector: options.selector, masks };
  }
  if (options.route) {
    const url = `${options.appBase ?? APP_BASE}${options.route}`;
    return { mode: masks.length > 0 ? "mask" : "route", url, selector: options.selector, masks };
  }
  throw new Error("design-match: chybí scéna — zadej --story <id> nebo --route <cesta>");
}

export async function shootScene(page, scene, outPath) {
  await page.goto(scene.url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const target = page.locator(scene.selector).first();
  await target.waitFor({ state: "visible" });
  return target.screenshot({
    path: outPath,
    mask: scene.masks.map((selector) => page.locator(selector)),
  });
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm exec vitest run --project design-match shoot`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the scene recipes reference**

Create `.claude/skills/design-match/references/scene-recipes.md`:

````markdown
# Scene recipes

Three ways to get the implementation onto screen for comparison. Prefer them in
this order.

## C — Storybook story (default for DS components)

```bash
pnpm storybook            # http://localhost:6006
```

Write a story whose args mirror the mockup's content exactly — same strings, same
counts, same states. Then:

```bash
node tools/design-match/cli.mjs compare --slug epic-card \
  --story ds-epiccard--from-design --selector "#storybook-root > *"
```

The engine hits `/iframe.html?id=…&viewMode=story`, so no Storybook chrome is in
the shot.

## A — seeded route (page composition)

Seed `.e2e-data` the way `e2e/global-setup.ts` does, then boot both servers:

```bash
ZIBBY_DATA_DIR=.e2e-data pnpm dev
node tools/design-match/cli.mjs compare --slug roadmap-board \
  --route /roadmap --selector "[data-testid=roadmap-board]"
```

Seed values must match the mockup's content exactly. A different task title is a
different pixel width.

## B — mask (fallback only)

For blocks that cannot be made deterministic — relative timestamps, live
counters:

```bash
node tools/design-match/cli.mjs compare --slug roadmap-board \
  --route /roadmap --selector "[data-testid=roadmap-board]" \
  --mask "[data-testid=relative-time]"
```

Every mask is printed in `report.md`. A masked region is unverified area and must
stay visible as such.
````

- [ ] **Step 6: Format and commit**

```bash
pnpm exec prettier --write tools/design-match/shoot.mjs tools/design-match/shoot.test.mjs .claude/skills/design-match/references/scene-recipes.md
rtk git add tools/design-match .claude/skills/design-match
rtk git commit -m "feat(design-match): scene resolution for story, route and mask modes"
```

---

### Task 11: Loop controller and report writers

**Files:**

- Create: `tools/design-match/loop.mjs`
- Create: `tools/design-match/report.mjs`
- Test: `tools/design-match/loop.test.mjs`

**Interfaces:**

- Consumes: `compareSkeletons` (Task 3), `compareValues` (Task 5), `diffPngs` (Task 7).
- Produces:
  - `evaluateRound(input): RoundVerdict` where
    `input = { skeleton: SkeletonVerdict, values: ValueDelta[]|null, pixels: PixelVerdict|null }` and
    `RoundVerdict = { status: "done"|"continue"|"stop", reason: string }`.
  - `decideNext(history: RoundVerdict[], rounds: RoundRecord[]): { stop: boolean, reason: string }` where
    `RoundRecord = { percent: number|null, skeletonPass: boolean }`.
  - `writeArtifacts(dir, payload): Promise<void>` writing `skeleton.md`, `tokens.md`, `components.md`, `report.md`, `round-N.json`.

- [ ] **Step 1: Write the failing tests**

Create `tools/design-match/loop.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { decideNext, evaluateRound } from "./loop.mjs";

const pass = { pass: true, findings: [] };
const fail = {
  pass: false,
  findings: [{ path: "form", kind: "layout-mode", message: "grid vs flex-column" }],
};

describe("evaluateRound", () => {
  it("stops before pixels when the skeleton gate fails", () => {
    const verdict = evaluateRound({ skeleton: fail, values: null, pixels: null });
    expect(verdict).toMatchObject({ status: "continue" });
    expect(verdict.reason).toContain("skeleton");
  });

  it("is done when skeleton passes, diff is under 0.5 % and no region exceeds 4×4", () => {
    const verdict = evaluateRound({
      skeleton: pass,
      values: [],
      pixels: { percent: 0.3, largestRegion: { w: 3, h: 4 }, diffBuffer: Buffer.alloc(0) },
    });
    expect(verdict.status).toBe("done");
  });

  it("is not done when a contiguous region exceeds 4×4 even at a low percentage", () => {
    const verdict = evaluateRound({
      skeleton: pass,
      values: [],
      pixels: { percent: 0.2, largestRegion: { w: 40, h: 30 }, diffBuffer: Buffer.alloc(0) },
    });
    expect(verdict.status).toBe("continue");
    expect(verdict.reason).toContain("40×30");
  });
});

describe("decideNext", () => {
  it("stops after two consecutive skeleton failures", () => {
    const result = decideNext(
      [],
      [
        { percent: null, skeletonPass: false },
        { percent: null, skeletonPass: false },
      ],
    );
    expect(result).toMatchObject({ stop: true });
    expect(result.reason).toContain("skeleton");
  });

  it("stops at the 5-round ceiling", () => {
    const rounds = Array.from({ length: 5 }, (_, i) => ({
      percent: 10 - i * 2,
      skeletonPass: true,
    }));
    expect(decideNext([], rounds)).toMatchObject({
      stop: true,
      reason: expect.stringContaining("5 kol"),
    });
  });

  it("stops when the diff stops falling by at least 20 % relative", () => {
    const result = decideNext(
      [],
      [
        { percent: 1.0, skeletonPass: true },
        { percent: 0.9, skeletonPass: true },
      ],
    );
    expect(result).toMatchObject({ stop: true });
    expect(result.reason).toContain("thrash");
  });

  it("continues while the diff is still falling fast", () => {
    expect(
      decideNext(
        [],
        [
          { percent: 10, skeletonPass: true },
          { percent: 4, skeletonPass: true },
        ],
      ),
    ).toMatchObject({ stop: false });
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm exec vitest run --project design-match loop`
Expected: FAIL — cannot resolve `./loop.mjs`.

- [ ] **Step 3: Implement the loop controller**

Create `tools/design-match/loop.mjs`:

```js
export const MAX_ROUNDS = 5;
export const DONE_PERCENT = 0.5;
export const MAX_REGION_SIDE = 4;
export const MIN_RELATIVE_DROP = 0.2;
export const MAX_SKELETON_FAILURES = 2;

/**
 * One round's verdict. The ordering is the whole point: a failed skeleton gate
 * short-circuits before values and before pixels, because tuning numbers on the
 * wrong structure is wasted work.
 */
export function evaluateRound({ skeleton, values, pixels }) {
  if (!skeleton.pass) {
    const first = skeleton.findings[0];
    return {
      status: "continue",
      reason: `skeleton gate neprošel: ${first ? first.message : "neznámý rozdíl"}`,
    };
  }
  if (values && values.length > 0) {
    return {
      status: "continue",
      reason: `${values.length} hodnotových delt, první: ${values[0].message}`,
    };
  }
  if (!pixels) {
    return { status: "continue", reason: "chybí pixel verdikt" };
  }
  const tooBig =
    pixels.largestRegion.w > MAX_REGION_SIDE || pixels.largestRegion.h > MAX_REGION_SIDE;
  if (pixels.percent < DONE_PERCENT && !tooBig) {
    return {
      status: "done",
      reason: `diff ${pixels.percent} %, největší region ${pixels.largestRegion.w}×${pixels.largestRegion.h}`,
    };
  }
  if (tooBig) {
    return {
      status: "continue",
      reason: `souvislý odlišný region ${pixels.largestRegion.w}×${pixels.largestRegion.h} px překračuje ${MAX_REGION_SIDE}×${MAX_REGION_SIDE}`,
    };
  }
  return { status: "continue", reason: `diff ${pixels.percent} % nad prahem ${DONE_PERCENT} %` };
}

export function decideNext(_history, rounds) {
  const skeletonFailures = rounds.filter((r) => !r.skeletonPass).length;
  if (skeletonFailures >= MAX_SKELETON_FAILURES) {
    return {
      stop: true,
      reason: `skeleton gate neprošel ${skeletonFailures}× — jde o volbu komponenty, ne o hodnoty; další kola by ladila čísla na špatném základu`,
    };
  }
  if (rounds.length >= MAX_ROUNDS) {
    return { stop: true, reason: `strop ${MAX_ROUNDS} kol vyčerpán` };
  }
  const [previous, current] = rounds.slice(-2);
  if (
    previous &&
    current &&
    previous.percent !== null &&
    current.percent !== null &&
    previous.percent > 0
  ) {
    const drop = (previous.percent - current.percent) / previous.percent;
    if (drop < MIN_RELATIVE_DROP) {
      return {
        stop: true,
        reason: `thrash — pokles jen ${Math.round(drop * 100)} %, práh je ${MIN_RELATIVE_DROP * 100} %`,
      };
    }
  }
  return { stop: false, reason: "pokračuje" };
}
```

- [ ] **Step 4: Implement the report writers**

Create `tools/design-match/report.mjs`:

```js
import fs from "node:fs/promises";
import path from "node:path";

const bullet = (line) => `- ${line}`;

function renderSkeleton(findings) {
  if (findings.length === 0)
    return "# Skeleton\n\nSedí — struktura implementace odpovídá designu.\n";
  const lines = ["# Skeleton", "", "SKELETON MISMATCH", ""];
  for (const finding of findings) {
    lines.push(
      `## \`${finding.path}\``,
      "",
      bullet(`**${finding.kind}** — ${finding.message}`),
      "",
    );
  }
  return lines.join("\n");
}

function renderTokens(mappings) {
  const lines = [
    "# Mapování tokenů",
    "",
    "| hodnota | výsledek | nejbližší existující | vzdálenost |",
    "| --- | --- | --- | --- |",
  ];
  for (const m of mappings) {
    lines.push(
      m.mapping.kind === "exact"
        ? `| \`${m.value}\` | \`${m.mapping.token}\` | — | 0 |`
        : `| \`${m.value}\` | **nový** \`${m.mapping.proposedName}\` | \`${m.mapping.nearest ?? "—"}\` | ${m.mapping.distance ?? "—"} |`,
    );
  }
  return lines.join("\n") + "\n";
}

function renderComponents(decisions) {
  const lines = ["# Volba komponent", ""];
  for (const d of decisions) {
    lines.push(`## \`${d.path}\` → ${d.chosen}`, "");
    if (d.rejected.length === 0) {
      lines.push(bullet("žádný existující DS kandidát nebyl zvažován"), "");
      continue;
    }
    for (const r of d.rejected) lines.push(bullet(`\`${r.component}\` zamítnut — ${r.reason}`));
    lines.push("");
  }
  return lines.join("\n");
}

function renderReport({ slug, rounds, verdict, masks }) {
  const lines = [
    `# design-match — ${slug}`,
    "",
    `**Výsledek:** ${verdict.stop ? "PARK" : "HOTOVO"} — ${verdict.reason}`,
    "",
    "## Kola",
    "",
  ];
  rounds.forEach((round, index) => {
    const percent = round.percent === null ? "—" : `${round.percent} %`;
    lines.push(
      bullet(
        `kolo ${index + 1}: skeleton ${round.skeletonPass ? "✓" : "✗"}, diff ${percent} — ${round.reason}`,
      ),
    );
  });
  if (masks.length > 0) {
    lines.push("", "## Maskované regiony (nezkontrolovaná plocha)", "");
    for (const mask of masks) lines.push(bullet(`\`${mask}\``));
  }
  return lines.join("\n") + "\n";
}

export async function writeArtifacts(dir, payload) {
  await fs.mkdir(dir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(dir, "skeleton.md"), renderSkeleton(payload.skeletonFindings), "utf8"),
    fs.writeFile(path.join(dir, "tokens.md"), renderTokens(payload.tokenMappings), "utf8"),
    fs.writeFile(
      path.join(dir, "components.md"),
      renderComponents(payload.componentDecisions),
      "utf8",
    ),
    fs.writeFile(path.join(dir, "report.md"), renderReport(payload), "utf8"),
    fs.writeFile(path.join(dir, "spec.json"), JSON.stringify(payload.spec, null, 2), "utf8"),
    ...payload.rounds.map((round, index) =>
      fs.writeFile(
        path.join(dir, `round-${index + 1}.json`),
        JSON.stringify(round, null, 2),
        "utf8",
      ),
    ),
  ]);
}
```

- [ ] **Step 5: Run and watch it pass**

Run: `pnpm exec vitest run --project design-match loop`
Expected: PASS, 7 tests.

- [ ] **Step 6: Format and commit**

```bash
pnpm exec prettier --write tools/design-match/loop.mjs tools/design-match/report.mjs tools/design-match/loop.test.mjs
rtk git add tools/design-match
rtk git commit -m "feat(design-match): bounded loop controller and artifact writers"
```

---

### Task 12: CLI wiring

**Files:**

- Create: `tools/design-match/cli.mjs`
- Test: `tools/design-match/cli.test.mjs`

**Interfaces:**

- Consumes: every module from Tasks 2–11.
- Produces: `parseArgs(argv: string[]): Command` where
  `Command = { command: "measure"|"compare", design?, description?, slug, story?, route?, selector?, masks: string[], strictWrappers: boolean }`.
  Subcommands: `measure <design.html> "<popis>"` (F1+F2 → `spec.json`) and `compare --slug <slug>` (F5).

- [ ] **Step 1: Write the failing tests**

Create `tools/design-match/cli.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli.mjs";

describe("parseArgs", () => {
  it("parses the measure form", () => {
    const cmd = parseArgs(["measure", "design/x.html", "karta epicu", "--slug", "epic-card"]);
    expect(cmd).toMatchObject({
      command: "measure",
      design: "design/x.html",
      description: "karta epicu",
      slug: "epic-card",
    });
  });

  it("derives the slug from the description when not given", () => {
    expect(parseArgs(["measure", "design/x.html", "Karta Epicu"]).slug).toBe("karta-epicu");
  });

  it("parses the compare form with repeated masks", () => {
    const cmd = parseArgs([
      "compare",
      "--slug",
      "epic-card",
      "--route",
      "/roadmap",
      "--mask",
      ".a",
      "--mask",
      ".b",
    ]);
    expect(cmd).toMatchObject({
      command: "compare",
      slug: "epic-card",
      route: "/roadmap",
      masks: [".a", ".b"],
    });
  });

  it("carries the strict-wrappers knob", () => {
    expect(parseArgs(["measure", "d.html", "x", "--strict-wrappers"]).strictWrappers).toBe(true);
  });

  it("rejects an unknown command", () => {
    expect(() => parseArgs(["frobnicate"])).toThrow(/measure|compare/);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm exec vitest run --project design-match cli`
Expected: FAIL — cannot resolve `./cli.mjs`.

- [ ] **Step 3: Implement**

Create `tools/design-match/cli.mjs`:

```js
#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { withPage } from "./browser.mjs";
import { ensureCdnCache } from "./cdn-cache.mjs";
import { compareSkeletons } from "./compare-skeleton.mjs";
import { compareValues } from "./compare-values.mjs";
import { extractRaw, extractValues } from "./extract.mjs";
import { collectRegions, cropRegions, formatInventory, rankCandidates } from "./inventory.mjs";
import { decideNext, evaluateRound } from "./loop.mjs";
import { normalizeSkeleton } from "./normalize.mjs";
import { diffPngs } from "./pixels.mjs";
import { writeArtifacts } from "./report.mjs";
import { resolveScene, shootScene } from "./shoot.mjs";

const ARTIFACT_ROOT = ".design-match";

const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== "measure" && command !== "compare") {
    throw new Error(`design-match: neznámý příkaz "${command}" — použij measure nebo compare`);
  }
  const positional = [];
  const flags = { masks: [], strictWrappers: false };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--strict-wrappers") flags.strictWrappers = true;
    else if (arg === "--mask") flags.masks.push(rest[(i += 1)]);
    else if (arg === "--slug") flags.slug = rest[(i += 1)];
    else if (arg === "--story") flags.story = rest[(i += 1)];
    else if (arg === "--route") flags.route = rest[(i += 1)];
    else if (arg === "--selector") flags.selector = rest[(i += 1)];
    else positional.push(arg);
  }
  const [design, description] = positional;
  return {
    command,
    design,
    description,
    slug: flags.slug ?? (description ? slugify(description) : undefined),
    story: flags.story,
    route: flags.route,
    selector: flags.selector,
    masks: flags.masks,
    strictWrappers: flags.strictWrappers,
  };
}

async function runMeasure(cmd) {
  const dir = path.join(ARTIFACT_ROOT, cmd.slug);
  const { localHtmlPath } = await ensureCdnCache(
    cmd.design,
    path.join(ARTIFACT_ROOT, ".cdn-cache"),
  );

  const spec = await withPage(async (page) => {
    await page.goto(pathToFileURL(localHtmlPath).href, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const ranked = rankCandidates(await collectRegions(page), cmd.description);
    await fs.mkdir(dir, { recursive: true });
    await cropRegions(page, ranked, dir);
    console.log(formatInventory(ranked));
    const chosen = ranked[0];
    // design.png is written here and nowhere else — `compare` reads it every round.
    await page
      .locator(chosen.selector)
      .first()
      .screenshot({ path: path.join(dir, "design.png") });
    return {
      selector: chosen.selector,
      skeleton: normalizeSkeleton(await extractRaw(page, chosen.selector), {
        strictWrappers: cmd.strictWrappers,
      }),
      values: await extractValues(page, chosen.selector),
    };
  });

  await fs.writeFile(path.join(dir, "spec.json"), JSON.stringify(spec, null, 2), "utf8");
  console.log(`spec.json zapsán → ${path.join(dir, "spec.json")}`);
}

async function runCompare(cmd) {
  const dir = path.join(ARTIFACT_ROOT, cmd.slug);
  const spec = JSON.parse(await fs.readFile(path.join(dir, "spec.json"), "utf8"));
  const scene = resolveScene({ ...cmd, selector: cmd.selector ?? spec.selector });

  const result = await withPage(async (page) => {
    await page.goto(scene.url, { waitUntil: "networkidle" });
    const appSkeleton = normalizeSkeleton(await extractRaw(page, scene.selector), {
      strictWrappers: cmd.strictWrappers,
    });
    const skeleton = compareSkeletons(spec.skeleton, appSkeleton);
    if (!skeleton.pass) return { skeleton, values: null, pixels: null };

    const values = compareValues(spec.values, await extractValues(page, scene.selector));
    const appPng = await shootScene(page, scene, path.join(dir, "app.png"));
    const designPng = await fs.readFile(path.join(dir, "design.png"));
    return { skeleton, values, pixels: diffPngs(designPng, appPng) };
  });

  const verdict = evaluateRound(result);
  const rounds = [
    {
      percent: result.pixels ? result.pixels.percent : null,
      skeletonPass: result.skeleton.pass,
      reason: verdict.reason,
    },
  ];
  const next = decideNext([], rounds);

  await writeArtifacts(dir, {
    slug: cmd.slug,
    spec,
    rounds,
    verdict: verdict.status === "done" ? { stop: false, reason: verdict.reason } : next,
    masks: scene.masks,
    skeletonFindings: result.skeleton.findings,
    tokenMappings: [],
    componentDecisions: [],
  });

  console.log(`${verdict.status.toUpperCase()} — ${verdict.reason}`);
  process.exitCode = verdict.status === "done" ? 0 : 1;
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  const cmd = parseArgs(process.argv.slice(2));
  const run = cmd.command === "measure" ? runMeasure : runCompare;
  run(cmd).catch((error) => {
    console.error(`[design-match] ${error.message}`);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm exec vitest run --project design-match cli`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the whole project suite**

Run both:
`pnpm exec vitest run --project design-match` — all unit tests from Tasks 1–12
`pnpm exec vitest run --config tools/design-match/vitest.browser.config.ts` — all browser tests

- [ ] **Step 6: Format and commit**

```bash
pnpm exec prettier --write tools/design-match/cli.mjs tools/design-match/cli.test.mjs
rtk git add tools/design-match
rtk git commit -m "feat(design-match): CLI wiring for measure and compare"
```

---

### Task 13: Calibration — prove the instrument before trusting it

**Files:**

- Create: `tools/design-match/fixtures/calibration-good.html`
- Create: `tools/design-match/fixtures/calibration-bad.html`
- Test: `tools/design-match/calibration.browser.test.mjs`

**Interfaces:**

- Consumes: `withPage`, `extractRaw`, `normalizeSkeleton`, `compareSkeletons`, `diffPngs`.
- Produces: no new exports. This task's deliverable is the guarantee that the gate rejects what it must reject.

- [ ] **Step 1: Create the matching fixture**

Create `tools/design-match/fixtures/calibration-good.html` — byte-identical structure to `basic.html`, different class names (proving the gate compares structure, not class strings):

```html
<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: monospace;
        background: #0b0e13;
        color: #c9d4e8;
      }
      .panel {
        width: 400px;
        padding: 24px;
        background: #11151d;
        border-radius: 8px;
      }
      .fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .row {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
      }
      .row > label {
        width: 96px;
        font-size: 14px;
      }
      .row > input {
        flex: 1;
        height: 32px;
        background: #0b0e13;
        border: 1px solid #26303f;
      }
    </style>
  </head>
  <body>
    <div class="panel" data-region="card">
      <form class="fields">
        <div class="row"><label>Jméno</label><input type="text" /></div>
        <div class="row"><label>E-mail</label><input type="email" /></div>
        <div class="row"><label>Firma</label><input type="text" /></div>
        <div class="row"><label>Role</label><input type="text" /></div>
      </form>
    </div>
  </body>
</html>
```

- [ ] **Step 2: Create the deliberately-wrong fixture**

Create `tools/design-match/fixtures/calibration-bad.html` — the exact failure the spec describes: a grid form turned into a stacked flex column with the label above the field.

```html
<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: monospace;
        background: #0b0e13;
        color: #c9d4e8;
      }
      .panel {
        width: 400px;
        padding: 24px;
        background: #11151d;
        border-radius: 8px;
      }
      .fields {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .row {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .row > label {
        width: 100%;
        font-size: 14px;
      }
      .row > input {
        height: 32px;
        background: #0b0e13;
        border: 1px solid #26303f;
      }
    </style>
  </head>
  <body>
    <div class="panel" data-region="card">
      <form class="fields">
        <div class="row"><label>Jméno</label><input type="text" /></div>
        <div class="row"><label>E-mail</label><input type="email" /></div>
        <div class="row"><label>Firma</label><input type="text" /></div>
        <div class="row"><label>Role</label><input type="text" /></div>
      </form>
    </div>
  </body>
</html>
```

- [ ] **Step 3: Write the failing test**

Create `tools/design-match/calibration.browser.test.mjs`:

```js
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { withPage } from "./browser.mjs";
import { compareSkeletons } from "./compare-skeleton.mjs";
import { extractRaw } from "./extract.mjs";
import { normalizeSkeleton } from "./normalize.mjs";
import { diffPngs } from "./pixels.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => pathToFileURL(path.join(dir, "fixtures", name)).href;

async function skeletonOf(name) {
  return withPage(async (page) => {
    await page.goto(fixture(name));
    return normalizeSkeleton(await extractRaw(page, '[data-region="card"]'));
  });
}

async function shotOf(name) {
  return withPage(async (page) => {
    await page.goto(fixture(name));
    return page.locator('[data-region="card"]').screenshot();
  });
}

describe("calibration", () => {
  it("passes the gate for a structurally identical implementation", async () => {
    const verdict = compareSkeletons(
      await skeletonOf("basic.html"),
      await skeletonOf("calibration-good.html"),
    );
    expect(verdict.findings).toEqual([]);
    expect(verdict.pass).toBe(true);
  });

  it("measures near-zero residual pixel noise between the two matching fixtures", async () => {
    const verdict = diffPngs(await shotOf("basic.html"), await shotOf("calibration-good.html"));
    expect(verdict.percent).toBeLessThan(0.5);
  });

  it("REJECTS a grid form rebuilt as a stacked flex column", async () => {
    const verdict = compareSkeletons(
      await skeletonOf("basic.html"),
      await skeletonOf("calibration-bad.html"),
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.findings.some((f) => f.kind === "layout-mode")).toBe(true);
  });
});
```

- [ ] **Step 4: Run and watch it fail, then pass**

Run: `pnpm exec vitest run --config tools/design-match/vitest.browser.config.ts calibration`
Expected: the first run fails only if the fixtures are missing; once both fixtures exist, PASS, 3 tests. If test 3 passes the gate (i.e. `pass === true`), the gate is too loose — tighten `sizeTolerance` or the layout-mode check before proceeding. **A gate that accepts everything is worse than no gate.**

- [ ] **Step 5: Commit**

```bash
pnpm exec prettier --write tools/design-match/calibration.browser.test.mjs
rtk git add tools/design-match
rtk git commit -m "test(design-match): calibrate the gate both directions"
```

---

### Task 14: SKILL.md and references

**Files:**

- Create: `.claude/skills/design-match/SKILL.md`
- Create: `.claude/skills/design-match/references/computed-props.md`
- Create: `.claude/skills/design-match/references/skeleton-rules.md`

**Interfaces:**

- Consumes: the CLI from Task 12.
- Produces: the operator-facing entry point. No code.

- [ ] **Step 1: Write SKILL.md**

Create `.claude/skills/design-match/SKILL.md`:

````markdown
---
name: design-match
description: >
  Implement a design mockup to structural and pixel parity. Use whenever a
  design HTML artifact in design/ must become real UI in apps/web or
  libs/design-system — measures the mockup, gates on structure before pixels,
  and loops until it matches or parks with evidence.
---

# design-match

Spec: `docs/superpowers/specs/2026-07-31-design-match-design.md`.

## The rule this skill exists to enforce

**Structure first, values second, pixels last.** The failure this skill prevents
is not off-by-2px — it is inventing a different layout, or reaching for an
existing DS component whose internals do not match the design. So:

- **Reuse of an existing DS component is a result, not a default.** It must pass
  the skeleton check using only its existing props. If a variant would have to be
  added just for this one use, or its style overridden from outside, or a wrapper
  added to correct its size — that is a new component.
- **An unmatched value becomes a new token**, named semantically by role
  (`--zt-fg-secondary`), never by hex.
- **Never tune a value while the skeleton gate is red.** Two consecutive
  skeleton failures stop the run.

## Running it

```bash
# F1 + F2 — inventory, pick a region, measure it
node tools/design-match/cli.mjs measure "design/Z.I.B.B.Y/ZIBBY Roadmap.html" "karta epicu"

# F5 — compare the implementation against the measured spec
node tools/design-match/cli.mjs compare --slug karta-epicu --story ds-epiccard--from-design
node tools/design-match/cli.mjs compare --slug karta-epicu --route /roadmap
```

Flags: `--selector`, `--mask <sel>` (repeatable), `--strict-wrappers`, `--slug`.

## Reading the artifacts

Everything lands in `.design-match/<slug>/` (gitignored):

| File            | Read it when                                           |
| --------------- | ------------------------------------------------------ |
| `skeleton.md`   | the gate is red — this names the structural difference |
| `report.md`     | first, always — verdict, round history, masked regions |
| `tokens.md`     | reviewing DS growth before approving new tokens        |
| `components.md` | justifying why a new component was created             |
| `diff.png`      | skeleton is green and only pixels remain               |

## Gates

- **New tokens** are presented for approval before being written to
  `libs/design-system`.
- **Masked regions** are always listed in `report.md`. A masked region is
  unverified area — never mask silently.

## References

- `references/skeleton-rules.md` — what counts as a structural node
- `references/computed-props.md` — the measured property whitelist
- `references/scene-recipes.md` — Storybook / seeded route / mask
````

- [ ] **Step 2: Write the computed-props reference**

Create `.claude/skills/design-match/references/computed-props.md`:

```markdown
# Measured property whitelist

`getComputedStyle` exposes ~340 properties. Measuring all of them buries the real
delta in noise (every inherited default shows up as a "difference" the moment one
node's structure shifts). The whitelist in `tools/design-match/extract.mjs`
(`VALUE_PROPS`) is deliberately ~50 properties across six groups:

| Group     | Properties                                                                                                          | Why                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Box       | `display`, `position`, `boxSizing`, `width`/`height` + min/max                                                      | the frame everything else sits in                                                      |
| Spacing   | `margin*`, `padding*`, `gap`, `rowGap`, `columnGap`                                                                 | the single most common source of "nearly right"                                        |
| Flex/Grid | `flexDirection`, `flexWrap`, `alignItems`, `justifyContent`, `flexGrow`, `flexShrink`, `flexBasis`, `gridTemplate*` | duplicated in the skeleton on purpose — the skeleton has the mode, this has the detail |
| Type      | `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textTransform`, `textAlign`                 | where 14 vs 16 px hides                                                                |
| Paint     | `color`, `backgroundColor`, `backgroundImage`, `border*`, `borderRadius`, `boxShadow`, `opacity`                    | what token mapping consumes                                                            |
| Effects   | `transform`, `backdropFilter`, `mixBlendMode`                                                                       | ZIBBY's glass surfaces live here                                                       |

## Adding a property

Add it only when a real run produced a visible difference that no listed property
explained. Note the case in the table above so the list stays justified rather
than accumulating.

## Deliberately excluded

- **Animation and transition timing** — the skill compares static frames
  (spec: out of scope).
- **Scroll and overflow state** — non-deterministic between runs.
- **Inherited text defaults** (`wordSpacing`, `fontKerning`, …) — noise.
```

- [ ] **Step 3: Write the skeleton-rules reference**

Create `.claude/skills/design-match/references/skeleton-rules.md`:

```markdown
# Skeleton rules

The skeleton is the structural fingerprint the blocking gate compares. It answers
"is this the same structure?", never "does it look the same".

## What is a structural node

A visible element (≥ 1×1 px, not `display:none` / `visibility:hidden` /
`opacity:0`) up to depth 6 from the chosen region root.

## Wrapper collapsing (default ON)

A node collapses into its parent when **all** of:

- it has exactly one child,
- its layout mode is `block` (it lays nothing out itself), and
- its box is within 1 px of its parent's box on all four sides.

**Why:** implementations routinely add one presentational wrapper with no visual
effect. Failing the gate on it would make the gate cry wolf, and a gate people
route around is worse than none.

**When to turn it off:** `--strict-wrappers`. Use it if a run shows that the extra
wrappers themselves are what is going wrong — for example a wrapper introducing a
stacking context or clipping. This is the knob left open in the design review;
flip it if experience says the default hides real problems.

## Layout mode

Collapsed from `display` + `flex-direction` into one of `grid`, `flex-row`,
`flex-column`, `block`, `inline`. `grid` additionally carries a column count
parsed from `grid-template-columns`.

**A layout-mode mismatch stops the walk at that node.** Everything beneath is
being positioned by a different engine, so descending only produces noise.

## Roles

Derived from tag first (`form`, `label`, `input`, `button`→`action`, …), then
`role`/`data-role`, then class-name hints (`row`, `column`, `card`), then
`text`/`group`. Roles make the finding paths readable — `form/row[1]/input` —
and make child-order comparison meaningful across different class conventions.

## Relative geometry

Every node's box is stored as a fraction of its parent's, rounded to 3 decimals.
This is what catches "the element is smaller than in the design" independently of
the absolute size of the region. Default tolerance is 2 % of the parent box.
```

- [ ] **Step 4: Format and commit**

```bash
pnpm exec prettier --write .claude/skills/design-match
rtk git add .claude/skills/design-match
rtk git commit -m "docs(design-match): SKILL.md and references"
```

---

### Task 15: End-to-end dry run on a real mockup

**Files:**

- Modify: `.claude/skills/design-match/SKILL.md` (append a "Known limits" section with what the dry run found)

**Interfaces:**

- Consumes: everything.
- Produces: a recorded first real run. No new exports.

- [ ] **Step 1: Measure a real mockup**

Run:

```bash
node tools/design-match/cli.mjs measure "design/Z.I.B.B.Y/ZIBBY Roadmap.html" "karta epicu"
```

Expected: the CDN cache downloads React/Babel on first run, the inventory prints 5 numbered candidates with preview PNGs in `.design-match/karta-epicu/`, and `spec.json` is written.

- [ ] **Step 2: Confirm the artifacts are real, not empty**

Run: `node -e "const s=require('./.design-match/karta-epicu/spec.json');console.log(s.selector, JSON.stringify(s.skeleton.layout), Object.keys(s.values).length)"`
Expected: a real selector, a real layout mode, and a value-key count > 5. **A count of 1 or an empty skeleton means the mockup did not render — check the CDN cache before going further.**

- [ ] **Step 3: Record what the dry run found**

Append to `.claude/skills/design-match/SKILL.md`:

```markdown
## Known limits (from the first real run, 2026-07-31)

- Mockups that use `three.js` (`ZIBBY Velin-D.html`, `ZIBBY Orb.html`) render to a
  `<canvas>`. The skeleton sees one node and the pixel layer sees a moving target —
  measure the chrome around the canvas, not the canvas itself.
- The CDN cache must be warm before the first measure on a new machine. Without
  network the run fails fast rather than producing an empty screenshot.
```

- [ ] **Step 4: Commit**

```bash
pnpm exec prettier --write .claude/skills/design-match/SKILL.md
rtk git add .claude/skills/design-match/SKILL.md
rtk git commit -m "docs(design-match): record first real-run limits"
```

- [ ] **Step 5: Full verification before handoff**

Run each and confirm before claiming done:

```bash
pnpm exec vitest run --project design-match                                    # unit tests green
pnpm run test:browser                                                          # browser tests green
pnpm exec prettier --check tools/design-match .claude/skills/design-match
pnpm exec eslint tools/design-match
```

---

## Self-Review

**Spec coverage:**

| Spec section                           | Task                                                   |
| -------------------------------------- | ------------------------------------------------------ |
| F1 inventory                           | 9                                                      |
| F1 CDN preflight                       | 8                                                      |
| F1 font preflight                      | 8                                                      |
| F2 skeleton layer                      | 2, 4                                                   |
| F2 value layer                         | 4                                                      |
| F3 token mapping + semantic naming     | 6                                                      |
| F4 component choice as a check         | 11 (`components.md`), 14 (SKILL.md rule)               |
| F4 scene modes C/A/B                   | 10                                                     |
| F5 three-layer ordered comparison      | 11, 12                                                 |
| F5 bounds, thrash, skeleton-twice stop | 11                                                     |
| F5 park artifacts                      | 11                                                     |
| Calibration both directions            | 13                                                     |
| Testing strategy                       | 1 (project), 13                                        |
| Error handling table                   | 8 (CDN, font), 10 (missing scene), 11 (loop), 12 (CLI) |
| `.design-match/` gitignored            | 1                                                      |

**Gap accepted deliberately:** the loop in Task 12 runs a _single_ compare pass per
CLI invocation; the multi-round history that `decideNext` consumes is driven by the
agent re-invoking `compare` and by `round-N.json` accumulating. This keeps the CLI
stateless and the agent in the loop, which matches how the skill is actually used —
the agent must edit code between rounds, so an internal loop would have nothing to do.
`decideNext` is fully implemented and tested; the SKILL.md instructs the agent to stop
when it returns `stop: true`.

**Type consistency:** `SkelNode`, `Finding`, `ValueDelta`, `PixelVerdict`, `Scene`,
`RoundRecord` and `Mapping` are defined once in their producing task's Interfaces block
and consumed with the same field names throughout. `path` uses the same
`role[index]` convention in `normalize.mjs`, `extract.mjs` (`extractValues`) and
`compare-skeleton.mjs`.
