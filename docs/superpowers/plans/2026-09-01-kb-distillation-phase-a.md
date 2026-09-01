# KB Distillation — Phase A (write path) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nightly distillation of a team's knowledge base into durable learnings, filed one note per KB source file, inside a configurable gitignored folder in the KB itself.

**Architecture:** A new `KbDistillerService` sits above `TeamsStorageService`, `ClaudeCliDistiller` and a per-team `VaultService` bound to the KB's distill directory. It enumerates the KB's shared content (git-diff incremental after the first pass), strips and chunks each source file, extracts learnings with the same cheap-model distiller the vault pass uses, files one note per source file, appends a provenance line to the KB's tracked `_meta/log.md`, and advances a state file. It is dispatched from the existing `memory-distill` system automation, after the vault pass, with its own cap and its own `try/catch`.

**Tech Stack:** NestJS 11, TypeScript (strict + `noUncheckedIndexedAccess`), Zod via `@zibby/contracts`, Vitest (`--project api`), `gray-matter`, `promisify(execFile)` for git.

**Spec:** [`docs/superpowers/specs/2026-09-01-kb-distillation-design.md`](../specs/2026-09-01-kb-distillation-design.md)

## Global Constraints

- **`readOnly` stays `z.literal(true)`.** Never widen it to a boolean. Read-only is structural (Law 1).
- **`distillPath` must start with `output/`.** No absolute paths, no `..` segment, no leading `/` or `\`.
- **Hard-excluded KB paths, always:** `output/`, `inbox/`, `private/`, `_meta/`, `_templates/`, and any dot-directory.
- **Distillable KB paths:** `wiki/`, `meetings/`, `raw/` (recursive) and the single file `team-context.md`.
- **`libs/contracts` stays Node-free.** No `node:path`, no `node:fs` — pure string predicates only (precedent: `isAbsoluteHostPath`).
- **No autonomous git.** Never `git add`, `git commit`, `git push`, or `git pull` in the KB repo. Read-only git commands only (`rev-parse`, `diff`).
- **Fail-open.** `KbDistillerService.distill()` must never throw. Every fallible step is caught and logged.
- **No `any`.** Use `unknown`, `satisfies`, or generics.
- **Never write `forwardRef`** (React 19 — not relevant here, but repo-wide).
- **Test command:** `pnpm exec vitest run <path> --project api` (contracts: `--project contracts`).
- **After each file edit:** `pnpm exec prettier --write <file>` then `pnpm exec eslint --fix <file>`.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

**Create:**

| File                                           | Responsibility                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/kb/kb-paths.ts`                  | `isWithinRoot` + `rootPathOf`, extracted from `kb-reader.service.ts` so both the reader and the distiller share one containment chokepoint |
| `apps/api/src/kb/kb-distill-target.service.ts` | Team → absolute distill directory; containment/symlink-checked; creates the dir + its README                                               |
| `apps/api/src/kb/kb-source-text.ts`            | Pure text prep: VTT cue/timestamp stripping, duplicate-line collapse, chunking                                                             |
| `apps/api/src/kb/kb-source-scanner.ts`         | Which KB files are distillable; full walk and git-diff-since-sha enumeration                                                               |
| `apps/api/src/kb/kb-distill-state.ts`          | Read/write `.state.json` in the distill directory                                                                                          |
| `apps/api/src/kb/kb-meta-log.ts`               | Append one provenance line to the KB's tracked `_meta/log.md`                                                                              |
| `apps/api/src/kb/kb-distiller.service.ts`      | Orchestration: enumerate → prep → distill → file → log → advance state                                                                     |
| `apps/api/src/kb/kb-distiller.module.ts`       | DI wiring for the above                                                                                                                    |

**Modify:**

| File                                             | Change                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `libs/contracts/src/teams/team.schema.ts`        | Add `isSafeDistillPath` + `distillPath` to `KnowledgeBaseSourceSchema`; rewrite the `readOnly` docblock |
| `apps/api/src/kb/kb-reader.service.ts`           | Import `isWithinRoot`/`rootPathOf` from `kb-paths.ts` instead of defining them                          |
| `apps/api/src/automations/scheduler.service.ts`  | `memory-distill` case also runs the KB pass                                                             |
| `apps/api/src/automations/automations.module.ts` | Import `KbDistillerModule`                                                                              |
| `docs/api/memory.md`                             | Document the KB distillation pass                                                                       |

---

### Task 1: Contract — `distillPath`

**Files:**

- Modify: `libs/contracts/src/teams/team.schema.ts`
- Test: `libs/contracts/src/teams/team.schema.test.ts`

**Interfaces:**

- Consumes: nothing (first task).
- Produces: `isSafeDistillPath(p: string): boolean` (exported); `KnowledgeBaseSource` gains `distillPath?: string`.

- [ ] **Step 1: Write the failing tests**

Append to `libs/contracts/src/teams/team.schema.test.ts`:

```ts
describe("isSafeDistillPath", () => {
  it("accepts a path under output/", () => {
    expect(isSafeDistillPath("output/zibby-memory")).toBe(true);
    expect(isSafeDistillPath("output/nested/deeper")).toBe(true);
  });

  it("rejects anything not under output/", () => {
    expect(isSafeDistillPath("inbox/zibby")).toBe(false);
    expect(isSafeDistillPath("private/zibby")).toBe(false);
    expect(isSafeDistillPath("wiki/notes")).toBe(false);
    expect(isSafeDistillPath("output")).toBe(false);
    expect(isSafeDistillPath("outputs/zibby")).toBe(false);
  });

  it("rejects traversal and absolute paths", () => {
    expect(isSafeDistillPath("output/../../etc")).toBe(false);
    expect(isSafeDistillPath("output/..")).toBe(false);
    expect(isSafeDistillPath("/output/zibby")).toBe(false);
    expect(isSafeDistillPath("\\output\\zibby")).toBe(false);
    expect(isSafeDistillPath("C:/output/zibby")).toBe(false);
    expect(isSafeDistillPath("")).toBe(false);
  });
});

describe("KnowledgeBaseSourceSchema distillPath", () => {
  it("accepts a source with a valid distillPath", () => {
    const parsed = KnowledgeBaseSourceSchema.parse({
      kind: "vault",
      path: "/tmp/kb",
      readOnly: true,
      distillPath: "output/zibby-memory",
    });
    expect(parsed.distillPath).toBe("output/zibby-memory");
  });

  it("accepts a source with no distillPath (distillation off)", () => {
    const parsed = KnowledgeBaseSourceSchema.parse({
      kind: "vault",
      path: "/tmp/kb",
      readOnly: true,
    });
    expect(parsed.distillPath).toBeUndefined();
  });

  it("rejects a distillPath outside output/", () => {
    const result = KnowledgeBaseSourceSchema.safeParse({
      kind: "vault",
      path: "/tmp/kb",
      readOnly: true,
      distillPath: "private/zibby",
    });
    expect(result.success).toBe(false);
  });

  it("still rejects a non-literal readOnly", () => {
    const result = KnowledgeBaseSourceSchema.safeParse({
      kind: "vault",
      path: "/tmp/kb",
      readOnly: false,
      distillPath: "output/zibby-memory",
    });
    expect(result.success).toBe(false);
  });
});
```

Add `isSafeDistillPath` to the existing import at the top of that test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run libs/contracts/src/teams/team.schema.test.ts --project contracts`
Expected: FAIL — `isSafeDistillPath is not a function`.

- [ ] **Step 3: Implement**

In `libs/contracts/src/teams/team.schema.ts`, add above `KnowledgeBaseSourceSchema`:

```ts
/**
 * True for a relative path that is safe to write inside a knowledge base: it
 * must live under `output/` — the only directory the KB's own `AGENTS.md`
 * grants agents read/write, and one of the two gitignored per-user zones
 * (`inbox/` is the human triage queue; `private/` is off-limits by KB Rules
 * 11–12). Dependency-free (no `node:path`) for the same reason as
 * {@link isAbsoluteHostPath}: `libs/contracts` stays usable outside Node.
 */
export function isSafeDistillPath(p: string): boolean {
  if (p.length === 0) return false;
  if (p.startsWith("/") || p.startsWith("\\") || /^[a-zA-Z]:[\\/]/.test(p)) return false;
  const segments = p.split(/[\\/]/);
  if (segments.some((s) => s === "" || s === "." || s === "..")) return false;
  return segments.length >= 2 && segments[0] === "output";
}
```

Add to the `kind: "vault"` object, after `readOnly`:

```ts
      /**
       * Relative path INSIDE the knowledge base where distilled learnings are
       * written (must be under `output/` — see {@link isSafeDistillPath}).
       * ABSENT means KB distillation is off for this team: it is the opt-in.
       */
      distillPath: z.string().min(1).refine(isSafeDistillPath, {
        message: "must be a relative path under output/",
      }).optional(),
```

Replace the `readOnly` docblock paragraph above `KnowledgeBaseSourceSchema` with:

```ts
 * `readOnly` is a literal `true`, not a boolean: read-only is structural (Law 1),
 * not a setting an operator can weaken. It means ZIBBY never writes TRACKED or
 * SHARED knowledge-base content. The one write window that exists is
 * `distillPath` — a gitignored, structurally validated directory under
 * `output/`, plus the append-only provenance line the KB's own contract
 * requires in `_meta/log.md`.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run libs/contracts/src/teams/team.schema.test.ts --project contracts`
Expected: PASS.

- [ ] **Step 5: Typecheck the ripple**

Run: `pnpm exec tsc -p libs/contracts/tsconfig.json --noEmit`
Expected: no errors. (`distillPath` is optional, so no call site breaks.)

- [ ] **Step 6: Format, lint, commit**

```bash
pnpm exec prettier --write libs/contracts/src/teams/team.schema.ts libs/contracts/src/teams/team.schema.test.ts
pnpm exec eslint --fix libs/contracts/src/teams/team.schema.ts libs/contracts/src/teams/team.schema.test.ts
git add libs/contracts/src/teams/team.schema.ts libs/contracts/src/teams/team.schema.test.ts
git commit -m "feat(contracts): add distillPath to the team knowledge-base source

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Extract shared KB path helpers

**Files:**

- Create: `apps/api/src/kb/kb-paths.ts`
- Create: `apps/api/src/kb/kb-paths.test.ts`
- Modify: `apps/api/src/kb/kb-reader.service.ts`

**Interfaces:**

- Consumes: `KnowledgeBaseSource` from Task 1.
- Produces: `isWithinRoot(root: string, candidate: string): boolean`, `rootPathOf(source: KnowledgeBaseSource): string | null`.

This is a pure move — `kb-reader.service.ts` currently defines both privately, and the distiller needs the identical containment check. One chokepoint, not two.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/kb/kb-paths.test.ts`:

```ts
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { isWithinRoot, rootPathOf } from "./kb-paths";

describe("isWithinRoot", () => {
  const root = path.resolve("/tmp/kb");

  it("accepts the root itself and paths beneath it", () => {
    expect(isWithinRoot(root, root)).toBe(true);
    expect(isWithinRoot(root, path.resolve("/tmp/kb/output/x.md"))).toBe(true);
  });

  it("rejects siblings and escapes", () => {
    expect(isWithinRoot(root, path.resolve("/tmp/kb-other/x.md"))).toBe(false);
    expect(isWithinRoot(root, path.resolve("/tmp/x.md"))).toBe(false);
  });
});

describe("rootPathOf", () => {
  it("returns the path of a vault source", () => {
    expect(rootPathOf({ kind: "vault", path: "/tmp/kb", readOnly: true })).toBe("/tmp/kb");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/api/src/kb/kb-paths.test.ts --project api`
Expected: FAIL — cannot resolve `./kb-paths`.

- [ ] **Step 3: Create the module**

Create `apps/api/src/kb/kb-paths.ts`:

```ts
import * as path from "node:path";
import type { KnowledgeBaseSource } from "@zibby/contracts";

/**
 * Containment check, the `resolveSafeFile` shape
 * (`apps/api/src/shared/file-storage/file-utils.ts:56-66`): `candidate` (an
 * already `path.resolve`d path) must be the root itself or live strictly
 * beneath it. Shared by `KbReaderService` (read) and `KbDistillTargetService`
 * (write) so both obey ONE containment rule.
 */
export function isWithinRoot(root: string, candidate: string): boolean {
  const withSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return candidate === root || candidate.startsWith(withSep);
}

/** The absolute host root of a knowledge-base source, or null for a kind with none. */
export function rootPathOf(source: KnowledgeBaseSource): string | null {
  switch (source.kind) {
    case "vault":
      return source.path;
    default: {
      const _exhaustive: never = source.kind;
      return _exhaustive;
    }
  }
}
```

- [ ] **Step 4: Delete the private copies from `kb-reader.service.ts`**

Remove the local `isWithinRoot` and `rootPathOf` function declarations, and add at the top of the import block:

```ts
import { isWithinRoot, rootPathOf } from "./kb-paths";
```

- [ ] **Step 5: Run both test files to verify they pass**

Run: `pnpm exec vitest run apps/api/src/kb/kb-paths.test.ts apps/api/src/kb/kb-reader.service.test.ts --project api`
Expected: PASS — the reader's existing tests prove the move was behaviour-preserving.

- [ ] **Step 6: Format, lint, commit**

```bash
pnpm exec prettier --write apps/api/src/kb/kb-paths.ts apps/api/src/kb/kb-paths.test.ts apps/api/src/kb/kb-reader.service.ts
pnpm exec eslint --fix apps/api/src/kb/kb-paths.ts apps/api/src/kb/kb-paths.test.ts apps/api/src/kb/kb-reader.service.ts
git add apps/api/src/kb/kb-paths.ts apps/api/src/kb/kb-paths.test.ts apps/api/src/kb/kb-reader.service.ts
git commit -m "refactor(kb): extract isWithinRoot/rootPathOf into one shared chokepoint

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `KbDistillTargetService`

**Files:**

- Create: `apps/api/src/kb/kb-distill-target.service.ts`
- Create: `apps/api/src/kb/kb-distill-target.service.test.ts`

**Interfaces:**

- Consumes: `isWithinRoot`, `rootPathOf` (Task 2); `KnowledgeBaseSource.distillPath` (Task 1).
- Produces: `class KbDistillTargetService { resolve(source: KnowledgeBaseSource): Promise<string | null> }` — the absolute distill directory, created on disk with a README, or `null` when distillation is off/unsafe/unavailable.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/kb/kb-distill-target.service.test.ts`:

```ts
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KbDistillTargetService } from "./kb-distill-target.service";

describe("KbDistillTargetService", () => {
  let root: string;
  let service: KbDistillTargetService;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "kb-target-"));
    service = new KbDistillTargetService();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("returns null when the source has no distillPath", async () => {
    expect(await service.resolve({ kind: "vault", path: root, readOnly: true })).toBeNull();
  });

  it("returns null when the KB root does not exist", async () => {
    const missing = path.join(root, "nope");
    expect(
      await service.resolve({
        kind: "vault",
        path: missing,
        readOnly: true,
        distillPath: "output/zibby-memory",
      }),
    ).toBeNull();
  });

  it("creates the distill directory and a README", async () => {
    const dir = await service.resolve({
      kind: "vault",
      path: root,
      readOnly: true,
      distillPath: "output/zibby-memory",
    });
    expect(dir).toBe(path.resolve(root, "output/zibby-memory"));
    const readme = await fs.readFile(path.join(dir as string, "README.md"), "utf8");
    expect(readme).toContain("ZIBBY");
  });

  it("is idempotent — a second resolve does not fail or clobber", async () => {
    const source = {
      kind: "vault" as const,
      path: root,
      readOnly: true as const,
      distillPath: "output/zibby-memory",
    };
    const first = await service.resolve(source);
    await fs.writeFile(path.join(first as string, "marker.txt"), "kept", "utf8");
    const second = await service.resolve(source);
    expect(second).toBe(first);
    expect(await fs.readFile(path.join(first as string, "marker.txt"), "utf8")).toBe("kept");
  });

  it("refuses a distill path that resolves outside the KB root via a symlink", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "kb-outside-"));
    await fs.mkdir(path.join(root, "output"), { recursive: true });
    await fs.symlink(outside, path.join(root, "output", "escape"), "dir");
    expect(
      await service.resolve({
        kind: "vault",
        path: root,
        readOnly: true,
        distillPath: "output/escape",
      }),
    ).toBeNull();
    await fs.rm(outside, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/api/src/kb/kb-distill-target.service.test.ts --project api`
Expected: FAIL — cannot resolve `./kb-distill-target.service`.

- [ ] **Step 3: Implement**

Create `apps/api/src/kb/kb-distill-target.service.ts`:

```ts
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import type { KnowledgeBaseSource } from "@zibby/contracts";
import { isWithinRoot, rootPathOf } from "./kb-paths";

/** Dropped into a fresh distill directory so a teammate opening the KB knows what it is. */
const README_BODY = [
  "# ZIBBY distilled memory",
  "",
  "Machine-written. ZIBBY distils this knowledge base's shared content into durable",
  "learnings and files them here — one note per source file, with `sources:`",
  "frontmatter pointing back at the file it came from.",
  "",
  "This directory is **gitignored** (it lives under `output/`), so nothing here is",
  "shared with the team. Every pass also appends one provenance line to",
  "`_meta/log.md`, which is tracked — that is the shared trace.",
  "",
  "Safe to delete: the next pass rebuilds it from scratch.",
  "",
].join("\n");

/**
 * Resolves a team knowledge base to the absolute directory ZIBBY may write
 * distilled learnings into — the ONE write window that exists in an otherwise
 * `readOnly` knowledge base.
 *
 * Every "no" yields `null`, never a throw: no `distillPath` configured
 * (distillation is off — this is the opt-in), a missing/non-directory KB root,
 * or a target that fails the containment or symlink check. A misconfigured team
 * KB must never break the nightly pass.
 */
@Injectable()
export class KbDistillTargetService {
  async resolve(source: KnowledgeBaseSource): Promise<string | null> {
    const distillPath = source.distillPath;
    if (distillPath === undefined) return null;

    const rootPath = rootPathOf(source);
    if (rootPath === null) return null;
    const root = path.resolve(rootPath);
    const rootStat = await fs.stat(root).catch(() => null);
    if (!rootStat || !rootStat.isDirectory()) return null;

    const dir = path.resolve(root, distillPath);
    // `isSafeDistillPath` already rejected traversal at the contract layer; this
    // is the independent second guard (same belt-and-braces shape as
    // `resolveSafeFile`), and it also catches a symlinked ancestor below.
    if (!isWithinRoot(root, dir) || dir === root) return null;

    // Refuse a symlinked target (file OR directory) outright — never follow one
    // out of the KB. Mirrors `KbReaderService.walk`'s posture exactly.
    const existing = await fs.lstat(dir).catch(() => null);
    if (existing?.isSymbolicLink()) return null;
    if (existing && !existing.isDirectory()) return null;

    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      return null;
    }

    // Written once; never overwritten, so an operator's edits survive.
    const readme = path.join(dir, "README.md");
    if (!(await fs.stat(readme).catch(() => null))) {
      await fs.writeFile(readme, README_BODY, "utf8").catch(() => undefined);
    }
    return dir;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/api/src/kb/kb-distill-target.service.test.ts --project api`
Expected: PASS (5 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
pnpm exec prettier --write apps/api/src/kb/kb-distill-target.service.ts apps/api/src/kb/kb-distill-target.service.test.ts
pnpm exec eslint --fix apps/api/src/kb/kb-distill-target.service.ts apps/api/src/kb/kb-distill-target.service.test.ts
git add apps/api/src/kb/kb-distill-target.service.ts apps/api/src/kb/kb-distill-target.service.test.ts
git commit -m "feat(kb): resolve a team KB's distill directory with containment guards

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Source text preparation (VTT strip + chunk)

**Files:**

- Create: `apps/api/src/kb/kb-source-text.ts`
- Create: `apps/api/src/kb/kb-source-text.test.ts`

**Interfaces:**

- Consumes: nothing (pure functions).
- Produces: `stripVtt(raw: string): string`, `prepareSourceText(relPath: string, raw: string): string`, `chunkText(text: string, maxChars?: number): string[]`, `KB_CHUNK_CHARS: number`.

This is the task that replaces the run distiller's `EXCERPT_LIMIT = 1200` shortcut, which would sample under 1% of a 233 KB transcript (spec §5.3).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/kb/kb-source-text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { KB_CHUNK_CHARS, chunkText, prepareSourceText, stripVtt } from "./kb-source-text";

const VTT = [
  "WEBVTT",
  "",
  "1",
  "00:00:01.000 --> 00:00:04.000",
  "<v Pavel>Dobrý den, začneme.",
  "",
  "2",
  "00:00:04.000 --> 00:00:07.000",
  "Dobrý den, začneme.",
  "",
  "3",
  "00:00:07.000 --> 00:00:11.000",
  "Máme pět bodů na programu.",
  "",
].join("\n");

describe("stripVtt", () => {
  it("drops the WEBVTT header, cue ids and timestamp lines", () => {
    const out = stripVtt(VTT);
    expect(out).not.toContain("WEBVTT");
    expect(out).not.toContain("-->");
    expect(out).not.toMatch(/^\d+$/m);
  });

  it("strips speaker markup but keeps the spoken text", () => {
    expect(stripVtt(VTT)).toContain("Dobrý den, začneme.");
    expect(stripVtt(VTT)).not.toContain("<v Pavel>");
  });

  it("collapses consecutive duplicate lines", () => {
    const out = stripVtt(VTT);
    expect(out.split("\n").filter((l) => l === "Dobrý den, začneme.")).toHaveLength(1);
  });

  it("keeps a non-consecutive repeat", () => {
    const raw = [
      "WEBVTT",
      "",
      "00:00:01.000 --> 00:00:02.000",
      "ano",
      "",
      "00:00:02.000 --> 00:00:03.000",
      "ne",
      "",
      "00:00:03.000 --> 00:00:04.000",
      "ano",
      "",
    ].join("\n");
    expect(stripVtt(raw).split("\n")).toEqual(["ano", "ne", "ano"]);
  });
});

describe("prepareSourceText", () => {
  it("strips VTT for a .vtt path", () => {
    expect(prepareSourceText("meetings/a.vtt", VTT)).not.toContain("-->");
  });

  it("returns markdown untouched apart from trimming", () => {
    expect(prepareSourceText("wiki/notes/a.md", "# Title\n\nBody\n")).toBe("# Title\n\nBody");
  });
});

describe("chunkText", () => {
  it("returns one chunk when the text fits", () => {
    expect(chunkText("short", 100)).toEqual(["short"]);
  });

  it("returns no chunks for empty text", () => {
    expect(chunkText("   ", 100)).toEqual([]);
  });

  it("splits on a line boundary rather than mid-line", () => {
    const text = ["aaaa", "bbbb", "cccc"].join("\n");
    const chunks = chunkText(text, 10);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.split("\n").every((l) => l.length === 4)).toBe(true);
    expect(chunks.join("\n")).toBe(text);
  });

  it("hard-splits a single line longer than the limit", () => {
    const chunks = chunkText("x".repeat(25), 10);
    expect(chunks).toHaveLength(3);
    expect(chunks.join("")).toBe("x".repeat(25));
  });

  it("has a sane default chunk size", () => {
    expect(KB_CHUNK_CHARS).toBeGreaterThan(4000);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/api/src/kb/kb-source-text.test.ts --project api`
Expected: FAIL — cannot resolve `./kb-source-text`.

- [ ] **Step 3: Implement**

Create `apps/api/src/kb/kb-source-text.ts`:

```ts
/**
 * Text preparation for knowledge-base distillation.
 *
 * The vault distiller feeds a fixed 1200-char excerpt per candidate — right for
 * a run's log tail, useless for a document: against a 233 KB meeting transcript
 * it samples under 1%. KB sources are therefore stripped, de-duplicated and
 * CHUNKED, and every chunk is distilled (see `KbDistillerService`).
 */

/** Per-chunk character budget fed to the distiller model. */
export const KB_CHUNK_CHARS = 12_000;

/** `00:00:01.000 --> 00:00:04.000` (with or without cue settings after it). */
const VTT_TIMESTAMP = /^\s*(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->\s/;
/** A bare cue identifier line (`1`, `42`). */
const VTT_CUE_ID = /^\s*\d+\s*$/;
/** `<v Pavel>`, `<c.colour>`, `</v>` — inline VTT markup, never content. */
const VTT_TAG = /<\/?[^>]+>/g;

/**
 * Reduce a `.vtt` transcript to the spoken text: drop the `WEBVTT` header,
 * `NOTE`/`STYLE` blocks, cue ids and timestamp lines, strip inline tags, and
 * collapse CONSECUTIVE duplicate lines (auto-captioning repeats a line across
 * cues constantly; a non-consecutive repeat is real and is kept).
 */
export function stripVtt(raw: string): string {
  const out: string[] = [];
  let previous: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.replace(VTT_TAG, "").trim();
    if (trimmed.length === 0) continue;
    if (trimmed === "WEBVTT" || trimmed.startsWith("WEBVTT ")) continue;
    if (trimmed.startsWith("NOTE") || trimmed.startsWith("STYLE")) continue;
    if (VTT_TIMESTAMP.test(trimmed) || VTT_CUE_ID.test(trimmed)) continue;
    if (trimmed === previous) continue;
    out.push(trimmed);
    previous = trimmed;
  }
  return out.join("\n");
}

/** Strip a `.vtt`; leave every other source as-is (trimmed). */
export function prepareSourceText(relPath: string, raw: string): string {
  return relPath.endsWith(".vtt") ? stripVtt(raw) : raw.trim();
}

/**
 * Split `text` into chunks of at most `maxChars`, preferring line boundaries so
 * a chunk never starts mid-sentence. A single line longer than `maxChars` is
 * hard-split. Concatenating the chunks reproduces the input (modulo the
 * newlines consumed at chosen boundaries).
 */
export function chunkText(text: string, maxChars: number = KB_CHUNK_CHARS): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks: string[] = [];
  let current = "";
  const flush = (): void => {
    if (current.length > 0) chunks.push(current);
    current = "";
  };

  for (const line of trimmed.split("\n")) {
    if (line.length > maxChars) {
      flush();
      for (let i = 0; i < line.length; i += maxChars) chunks.push(line.slice(i, i + maxChars));
      continue;
    }
    const candidate = current.length === 0 ? line : `${current}\n${line}`;
    if (candidate.length > maxChars) {
      flush();
      current = line;
      continue;
    }
    current = candidate;
  }
  flush();
  return chunks;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/api/src/kb/kb-source-text.test.ts --project api`
Expected: PASS (10 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
pnpm exec prettier --write apps/api/src/kb/kb-source-text.ts apps/api/src/kb/kb-source-text.test.ts
pnpm exec eslint --fix apps/api/src/kb/kb-source-text.ts apps/api/src/kb/kb-source-text.test.ts
git add apps/api/src/kb/kb-source-text.ts apps/api/src/kb/kb-source-text.test.ts
git commit -m "feat(kb): VTT stripping and line-aware chunking for KB sources

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Source enumeration + git incrementality

**Files:**

- Create: `apps/api/src/kb/kb-source-scanner.ts`
- Create: `apps/api/src/kb/kb-source-scanner.test.ts`

**Interfaces:**

- Consumes: `isWithinRoot` (Task 2); `exec`, `GIT_TIMEOUT_MS` from `../shared/git-exec`.
- Produces: `isDistillableSource(relPath: string): boolean`; `class KbSourceScanner { headSha(root): Promise<string | null>; changedSince(root, sha): Promise<string[] | null>; listAll(root): Promise<string[]> }`. All relative paths are forward-slash-joined and KB-root-relative.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/kb/kb-source-scanner.test.ts`:

```ts
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exec } from "../shared/git-exec";
import { KbSourceScanner, isDistillableSource } from "./kb-source-scanner";

describe("isDistillableSource", () => {
  it("accepts the shared content directories and team-context.md", () => {
    expect(isDistillableSource("wiki/notes/a.md")).toBe(true);
    expect(isDistillableSource("meetings/a.vtt")).toBe(true);
    expect(isDistillableSource("raw/a.md")).toBe(true);
    expect(isDistillableSource("team-context.md")).toBe(true);
  });

  it("rejects the local and schema zones", () => {
    expect(isDistillableSource("output/a.md")).toBe(false);
    expect(isDistillableSource("inbox/a.md")).toBe(false);
    expect(isDistillableSource("private/a.md")).toBe(false);
    expect(isDistillableSource("_meta/log.md")).toBe(false);
    expect(isDistillableSource("_templates/note.md")).toBe(false);
    expect(isDistillableSource(".claude/settings.json")).toBe(false);
    expect(isDistillableSource("README.md")).toBe(false);
    expect(isDistillableSource("AGENTS.md")).toBe(false);
  });

  it("rejects unsupported extensions", () => {
    expect(isDistillableSource("wiki/notes/a.png")).toBe(false);
  });
});

describe("KbSourceScanner", () => {
  let root: string;
  const scanner = new KbSourceScanner();

  const git = async (...args: string[]): Promise<void> => {
    await exec("git", args, { cwd: root, timeout: 10_000 });
  };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "kb-scan-"));
    await git("init");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "T");
    await fs.mkdir(path.join(root, "wiki/notes"), { recursive: true });
    await fs.mkdir(path.join(root, "output"), { recursive: true });
    await fs.writeFile(path.join(root, "wiki/notes/a.md"), "a", "utf8");
    await fs.writeFile(path.join(root, "output/local.md"), "local", "utf8");
    await fs.writeFile(path.join(root, "team-context.md"), "ctx", "utf8");
    await git("add", "wiki", "team-context.md");
    await git("commit", "-m", "one");
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("lists every distillable file and skips the excluded zones", async () => {
    const all = await scanner.listAll(root);
    expect(all).toEqual(["team-context.md", "wiki/notes/a.md"]);
  });

  it("returns the HEAD sha", async () => {
    const sha = await scanner.headSha(root);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("returns null headSha for a non-git directory", async () => {
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), "kb-plain-"));
    expect(await scanner.headSha(plain)).toBeNull();
    await fs.rm(plain, { recursive: true, force: true });
  });

  it("returns only the changed distillable files since a sha", async () => {
    const first = (await scanner.headSha(root)) as string;
    await fs.writeFile(path.join(root, "wiki/notes/b.md"), "b", "utf8");
    await fs.writeFile(path.join(root, "output/local.md"), "changed", "utf8");
    await git("add", "wiki");
    await git("commit", "-m", "two");
    expect(await scanner.changedSince(root, first)).toEqual(["wiki/notes/b.md"]);
  });

  it("returns an empty list when nothing changed", async () => {
    const sha = (await scanner.headSha(root)) as string;
    expect(await scanner.changedSince(root, sha)).toEqual([]);
  });

  it("omits a deleted file rather than reporting it as changed", async () => {
    const first = (await scanner.headSha(root)) as string;
    await git("rm", "wiki/notes/a.md");
    await git("commit", "-m", "three");
    expect(await scanner.changedSince(root, first)).toEqual([]);
  });

  it("returns null for an unknown sha so the caller can fall back", async () => {
    expect(await scanner.changedSince(root, "0".repeat(40))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/api/src/kb/kb-source-scanner.test.ts --project api`
Expected: FAIL — cannot resolve `./kb-source-scanner`.

- [ ] **Step 3: Implement**

Create `apps/api/src/kb/kb-source-scanner.ts`:

```ts
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import { GIT_TIMEOUT_MS, exec } from "../shared/git-exec";
import { isWithinRoot } from "./kb-paths";

/** Shared content directories a knowledge base offers for distillation. */
const DISTILLABLE_DIRS = ["wiki", "meetings", "raw"] as const;
/** Shared single files (not under a distillable directory). */
const DISTILLABLE_FILES = ["team-context.md"] as const;
/** Extensions the distiller can read. */
const DISTILLABLE_EXTS = [".md", ".vtt"] as const;

/**
 * Is this KB-relative path something ZIBBY may distil?
 *
 * Allow-list, not a deny-list: the local zones (`output/`, `inbox/`,
 * `private/`), the schema zones (`_meta/`, `_templates/`) and the repo's own
 * docs (`README.md`, `AGENTS.md`, `CLAUDE.md`) are all excluded simply by not
 * being listed. `output/` in particular MUST never be distillable — it holds
 * ZIBBY's own distillate, and feeding it back would loop.
 */
export function isDistillableSource(relPath: string): boolean {
  if (relPath.split("/").some((s) => s.startsWith("."))) return false;
  if (!DISTILLABLE_EXTS.some((ext) => relPath.endsWith(ext))) return false;
  if (DISTILLABLE_FILES.some((f) => relPath === f)) return true;
  return DISTILLABLE_DIRS.some((dir) => relPath.startsWith(`${dir}/`));
}

/**
 * Enumerates a knowledge base's distillable files — either all of them (first
 * pass) or only those changed since a sha (every pass after that). Read-only
 * git: `rev-parse` and `diff` only, never `add`/`commit`/`pull`/`push` (Law 3).
 *
 * Every "no" is `null`/`[]`, never a throw: a KB that is not a git repo, a sha
 * that no longer exists after a rebase, or an unreadable directory must
 * degrade to a full walk rather than break the nightly pass.
 */
@Injectable()
export class KbSourceScanner {
  /** The KB's current HEAD sha, or null when it is not a git work tree. */
  async headSha(root: string): Promise<string | null> {
    try {
      const { stdout } = await exec("git", ["rev-parse", "HEAD"], {
        cwd: root,
        timeout: GIT_TIMEOUT_MS,
      });
      const sha = stdout.trim();
      return sha.length > 0 ? sha : null;
    } catch {
      return null;
    }
  }

  /**
   * Distillable files added or modified between `sha` and HEAD. Deletions are
   * omitted (there is nothing left to distil). Returns `null` when the diff
   * cannot be computed — an unknown sha, or a non-git root — so the caller
   * falls back to a full walk instead of silently distilling nothing.
   */
  async changedSince(root: string, sha: string): Promise<string[] | null> {
    try {
      const { stdout } = await exec(
        "git",
        ["diff", "--name-only", "--diff-filter=ACMR", `${sha}..HEAD`],
        { cwd: root, timeout: GIT_TIMEOUT_MS },
      );
      return stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && isDistillableSource(l))
        .sort();
    } catch {
      return null;
    }
  }

  /** Every distillable file in the KB, sorted — the first-pass (and fallback) path. */
  async listAll(root: string): Promise<string[]> {
    const resolved = path.resolve(root);
    const out: string[] = [];
    await this.walk(resolved, resolved, out);
    return out.sort();
  }

  /**
   * Recursive walk with the same guards as `KbReaderService.walk`: dot-entries
   * skipped, every candidate containment-checked, every entry `lstat`'d and a
   * symlink (file OR directory) refused outright rather than followed.
   */
  private async walk(root: string, dir: string, out: string[]): Promise<void> {
    const dirents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const dirent of dirents) {
      if (dirent.name.startsWith(".")) continue;
      const full = path.resolve(dir, dirent.name);
      if (!isWithinRoot(root, full)) continue;
      const stat = await fs.lstat(full).catch(() => null);
      if (!stat || stat.isSymbolicLink()) continue;
      const relPath = path.relative(root, full).split(path.sep).join("/");
      if (stat.isDirectory()) {
        // Prune the excluded top-level zones before descending — no point
        // walking a large `output/` we would discard file-by-file anyway.
        const top = relPath.split("/")[0] ?? "";
        if (relPath.includes("/") || DISTILLABLE_DIRS.some((d) => d === top)) {
          await this.walk(root, full, out);
        }
        continue;
      }
      if (!stat.isFile()) continue;
      if (isDistillableSource(relPath)) out.push(relPath);
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/api/src/kb/kb-source-scanner.test.ts --project api`
Expected: PASS (10 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
pnpm exec prettier --write apps/api/src/kb/kb-source-scanner.ts apps/api/src/kb/kb-source-scanner.test.ts
pnpm exec eslint --fix apps/api/src/kb/kb-source-scanner.ts apps/api/src/kb/kb-source-scanner.test.ts
git add apps/api/src/kb/kb-source-scanner.ts apps/api/src/kb/kb-source-scanner.test.ts
git commit -m "feat(kb): enumerate distillable KB sources, git-incremental after the first pass

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Distill state + `_meta/log.md` provenance append

**Files:**

- Create: `apps/api/src/kb/kb-distill-state.ts`
- Create: `apps/api/src/kb/kb-distill-state.test.ts`
- Create: `apps/api/src/kb/kb-meta-log.ts`
- Create: `apps/api/src/kb/kb-meta-log.test.ts`

**Interfaces:**

- Consumes: `writeFileAtomic`, `safeJson` from `../shared/file-storage`.
- Produces: `interface KbDistillState { lastSha: string | null; lastRunAt: string | null }`, `readState(distillDir): Promise<KbDistillState>`, `writeState(distillDir, state): Promise<void>`, `KB_STATE_FILE`; and `appendMetaLog(root, line): Promise<boolean>`, `formatMetaLogLine(now, distillPath, noteCount, fileCount): string`.

Grouped in one task: both are tiny persistence helpers the distiller needs, and a reviewer would accept or reject them together.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/kb/kb-distill-state.test.ts`:

```ts
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KB_STATE_FILE, readState, writeState } from "./kb-distill-state";

describe("kb distill state", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-state-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads an empty state when the file is missing", async () => {
    expect(await readState(dir)).toEqual({ lastSha: null, lastRunAt: null });
  });

  it("round-trips a written state", async () => {
    await writeState(dir, { lastSha: "abc123", lastRunAt: "2026-09-01T03:00:00.000Z" });
    expect(await readState(dir)).toEqual({
      lastSha: "abc123",
      lastRunAt: "2026-09-01T03:00:00.000Z",
    });
  });

  it("falls back to an empty state on malformed JSON", async () => {
    await fs.writeFile(path.join(dir, KB_STATE_FILE), "{not json", "utf8");
    expect(await readState(dir)).toEqual({ lastSha: null, lastRunAt: null });
  });

  it("falls back to an empty state on a wrong-shaped payload", async () => {
    await fs.writeFile(path.join(dir, KB_STATE_FILE), JSON.stringify({ lastSha: 42 }), "utf8");
    expect(await readState(dir)).toEqual({ lastSha: null, lastRunAt: null });
  });
});
```

Create `apps/api/src/kb/kb-meta-log.test.ts`:

```ts
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendMetaLog, formatMetaLogLine } from "./kb-meta-log";

describe("formatMetaLogLine", () => {
  it("matches the KB's documented log format", () => {
    const line = formatMetaLogLine(
      new Date("2026-09-01T03:04:00.000Z"),
      "output/zibby-memory",
      3,
      5,
    );
    expect(line).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} \| agent:zibby \| output \| output\/zibby-memory: 3 note\(s\) distilled from 5 KB file\(s\); derived_from: —$/,
    );
  });
});

describe("appendMetaLog", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "kb-log-"));
    await fs.mkdir(path.join(root, "_meta"), { recursive: true });
    await fs.writeFile(path.join(root, "_meta/log.md"), "# Activity Log\n", "utf8");
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("appends exactly one line and preserves what was there", async () => {
    expect(await appendMetaLog(root, "LINE-A")).toBe(true);
    const body = await fs.readFile(path.join(root, "_meta/log.md"), "utf8");
    expect(body.startsWith("# Activity Log\n")).toBe(true);
    expect(body.trimEnd().endsWith("LINE-A")).toBe(true);
    expect(body.split("\n").filter((l) => l === "LINE-A")).toHaveLength(1);
  });

  it("appends a second line below the first", async () => {
    await appendMetaLog(root, "LINE-A");
    await appendMetaLog(root, "LINE-B");
    const lines = (await fs.readFile(path.join(root, "_meta/log.md"), "utf8"))
      .split("\n")
      .filter((l) => l.startsWith("LINE-"));
    expect(lines).toEqual(["LINE-A", "LINE-B"]);
  });

  it("returns false when the log file does not exist, creating nothing", async () => {
    const bare = await fs.mkdtemp(path.join(os.tmpdir(), "kb-nolog-"));
    expect(await appendMetaLog(bare, "LINE-A")).toBe(false);
    expect(await fs.readdir(bare)).toEqual([]);
    await fs.rm(bare, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/api/src/kb/kb-distill-state.test.ts apps/api/src/kb/kb-meta-log.test.ts --project api`
Expected: FAIL — cannot resolve `./kb-distill-state` / `./kb-meta-log`.

- [ ] **Step 3: Implement the state module**

Create `apps/api/src/kb/kb-distill-state.ts`:

```ts
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { safeJson, writeFileAtomic } from "../shared/file-storage";

/** Lives inside the distill directory (which is gitignored), never in the KB's shared tree. */
export const KB_STATE_FILE = ".state.json";

/**
 * What a previous distillation pass got through. `lastSha` is the KB commit the
 * pass distilled up to — the next pass diffs against it. This is why the KB's
 * OWN files never need a marker: a shared file cannot be stamped (it is not
 * ours to edit), so the watermark lives on our side of the boundary.
 */
export interface KbDistillState {
  lastSha: string | null;
  lastRunAt: string | null;
}

const EMPTY: KbDistillState = { lastSha: null, lastRunAt: null };

/** Read the state, degrading to an empty one for missing/corrupt/wrong-shaped files. */
export async function readState(distillDir: string): Promise<KbDistillState> {
  const raw = await fs.readFile(path.join(distillDir, KB_STATE_FILE), "utf8").catch(() => null);
  if (raw === null) return { ...EMPTY };
  const parsed = safeJson(raw);
  if (typeof parsed !== "object" || parsed === null) return { ...EMPTY };
  const record = parsed as Record<string, unknown>;
  const lastSha = typeof record.lastSha === "string" ? record.lastSha : null;
  const lastRunAt = typeof record.lastRunAt === "string" ? record.lastRunAt : null;
  return { lastSha, lastRunAt };
}

/** Persist the state atomically (temp file + rename), creating the directory if needed. */
export async function writeState(distillDir: string, state: KbDistillState): Promise<void> {
  await fs.mkdir(distillDir, { recursive: true });
  await writeFileAtomic(path.join(distillDir, KB_STATE_FILE), JSON.stringify(state, null, 2));
}
```

- [ ] **Step 4: Implement the meta-log module**

Create `apps/api/src/kb/kb-meta-log.ts`:

```ts
import { promises as fs } from "node:fs";
import * as path from "node:path";

/** The KB's append-only shared activity log. TRACKED by git — see the module doc. */
const META_LOG_REL = "_meta/log.md";

/** `YYYY-MM-DD HH:MM` in local time, the format `_meta/log.md` documents. */
function stamp(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return [
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  ].join(" ");
}

/**
 * One run line in the KB's documented format:
 * `YYYY-MM-DD HH:MM | <author> | <action> | <details>`.
 */
export function formatMetaLogLine(
  now: Date,
  distillPath: string,
  noteCount: number,
  fileCount: number,
): string {
  return [
    stamp(now),
    "agent:zibby",
    "output",
    `${distillPath}: ${noteCount} note(s) distilled from ${fileCount} KB file(s); derived_from: —`,
  ].join(" | ");
}

/**
 * Append one provenance line to the knowledge base's `_meta/log.md`.
 *
 * This file is TRACKED, and appending to it is the one place ZIBBY touches
 * shared KB content — mandated by the KB's own `AGENTS.md` (Rules 3–4 +
 * Provenance): a document in the gitignored `output/` tree is invisible to the
 * team except through this line. ZIBBY appends and stops there: no `git add`,
 * no commit, no push (Law 3) — the operator commits the dirty file.
 *
 * Returns `false` (creating nothing) when the KB has no `_meta/log.md`: absent
 * a log, this is not a KB following that contract, and inventing the file would
 * be writing shared structure we were not asked for.
 */
export async function appendMetaLog(root: string, line: string): Promise<boolean> {
  const file = path.resolve(root, META_LOG_REL);
  const existing = await fs.readFile(file, "utf8").catch(() => null);
  if (existing === null) return false;
  const separator = existing.endsWith("\n") ? "" : "\n";
  try {
    await fs.appendFile(file, `${separator}${line}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/api/src/kb/kb-distill-state.test.ts apps/api/src/kb/kb-meta-log.test.ts --project api`
Expected: PASS (8 tests).

- [ ] **Step 6: Format, lint, commit**

```bash
pnpm exec prettier --write apps/api/src/kb/kb-distill-state.ts apps/api/src/kb/kb-distill-state.test.ts apps/api/src/kb/kb-meta-log.ts apps/api/src/kb/kb-meta-log.test.ts
pnpm exec eslint --fix apps/api/src/kb/kb-distill-state.ts apps/api/src/kb/kb-distill-state.test.ts apps/api/src/kb/kb-meta-log.ts apps/api/src/kb/kb-meta-log.test.ts
git add apps/api/src/kb/kb-distill-state.ts apps/api/src/kb/kb-distill-state.test.ts apps/api/src/kb/kb-meta-log.ts apps/api/src/kb/kb-meta-log.test.ts
git commit -m "feat(kb): distill watermark state + KB _meta/log.md provenance append

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: `KbDistillerService`

**Files:**

- Create: `apps/api/src/kb/kb-distiller.service.ts`
- Create: `apps/api/src/kb/kb-distiller.service.test.ts`

**Interfaces:**

- Consumes: `TeamsStorageService.list()`; `KbDistillTargetService.resolve` (Task 3); `prepareSourceText`, `chunkText` (Task 4); `KbSourceScanner` (Task 5); `readState`/`writeState`, `appendMetaLog`/`formatMetaLogLine` (Task 6); `ClaudeCliDistiller.distill(runs: RunDigest[]): Promise<Learning[]>`; `VaultService` constructed directly as `new VaultService(distillDir)`.
- Produces: `MAX_KB_FILES_PER_PASS: number`, `kbNoteIdFor(teamId: string, relPath: string): string`, `class KbDistillerService { distill(now?: Date): Promise<string> }` returning `kb-distill:<count>`.

Note `RunDigest.kind` must be widened to include `"kb"` in `apps/api/src/memory/claude-cli-distiller.ts` (one-word change to the union on line 15).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/kb/kb-distiller.service.test.ts`:

```ts
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Team } from "@zibby/contracts";
import type { ClaudeCliDistiller, Learning, RunDigest } from "../memory/claude-cli-distiller";
import type { TeamsStorageService } from "../teams/teams.storage.service";
import { exec } from "../shared/git-exec";
import { KbDistillTargetService } from "./kb-distill-target.service";
import { KbSourceScanner } from "./kb-source-scanner";
import { KbDistillerService, kbNoteIdFor } from "./kb-distiller.service";

const LEARNING: Learning = {
  title: "Partner portal tiering",
  body: "Tiering is decided per partner volume, not per contract type.",
  type: "decision",
  tags: ["partner-portal"],
};

describe("kbNoteIdFor", () => {
  it("builds a filename-safe, collision-free id from the team and path", () => {
    expect(kbNoteIdFor("devrel", "meetings/partner-portal-feasibility.vtt")).toBe(
      "kb-devrel-meetings-partner-portal-feasibility",
    );
    expect(kbNoteIdFor("devrel", "wiki/notes/a.md")).toBe("kb-devrel-wiki-notes-a");
  });

  it("never produces a path separator", () => {
    expect(kbNoteIdFor("devrel", "wiki/notes/a b/c.md")).not.toContain("/");
  });
});

describe("KbDistillerService", () => {
  let root: string;
  let distillCalls: RunDigest[][];
  let service: KbDistillerService;

  const git = async (...args: string[]): Promise<void> => {
    await exec("git", args, { cwd: root, timeout: 10_000 });
  };

  const team: Team = {
    id: "devrel",
    name: "DevRel",
    knowledgeBase: {
      kind: "vault",
      path: "",
      readOnly: true,
      distillPath: "output/zibby-memory",
    },
  };

  const distillDir = (): string => path.join(root, "output/zibby-memory");

  const build = (learnings: Learning[]): KbDistillerService => {
    distillCalls = [];
    const teams = {
      list: async (): Promise<Team[]> => [
        { ...team, knowledgeBase: { ...team.knowledgeBase, path: root } } as Team,
      ],
    } as unknown as TeamsStorageService;
    const distiller = {
      distill: async (runs: RunDigest[]): Promise<Learning[]> => {
        distillCalls.push(runs);
        return learnings;
      },
    } as unknown as ClaudeCliDistiller;
    return new KbDistillerService(
      teams,
      new KbDistillTargetService(),
      new KbSourceScanner(),
      distiller,
    );
  };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "kb-distill-"));
    await git("init");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "T");
    await fs.mkdir(path.join(root, "wiki/notes"), { recursive: true });
    await fs.mkdir(path.join(root, "_meta"), { recursive: true });
    await fs.writeFile(path.join(root, "_meta/log.md"), "# Activity Log\n", "utf8");
    await fs.writeFile(path.join(root, "wiki/notes/a.md"), "# A\n\nAlpha content.", "utf8");
    await git("add", ".");
    await git("commit", "-m", "one");
    service = build([LEARNING]);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("files one note per source file, with sources frontmatter", async () => {
    const ref = await service.distill(new Date("2026-09-01T03:00:00.000Z"));
    expect(ref).toBe("kb-distill:1");
    const note = await fs.readFile(
      path.join(distillDir(), "knowledge/kb-devrel-wiki-notes-a.md"),
      "utf8",
    );
    expect(note).toContain("wiki/notes/a.md");
    expect(note).toContain(LEARNING.title);
    expect(note).toContain("distilledThroughSha");
  });

  it("appends exactly one provenance line to the tracked _meta/log.md", async () => {
    await service.distill(new Date("2026-09-01T03:00:00.000Z"));
    const log = await fs.readFile(path.join(root, "_meta/log.md"), "utf8");
    const lines = log.split("\n").filter((l) => l.includes("agent:zibby"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("output/zibby-memory");
  });

  it("is incremental — a second pass with no KB change distils nothing", async () => {
    await service.distill(new Date("2026-09-01T03:00:00.000Z"));
    const callsAfterFirst = distillCalls.length;
    const ref = await service.distill(new Date("2026-09-02T03:00:00.000Z"));
    expect(ref).toBe("kb-distill:0");
    expect(distillCalls).toHaveLength(callsAfterFirst);
  });

  it("picks up exactly the file changed since the last pass", async () => {
    await service.distill(new Date("2026-09-01T03:00:00.000Z"));
    await fs.writeFile(path.join(root, "wiki/notes/b.md"), "# B\n\nBeta.", "utf8");
    await git("add", ".");
    await git("commit", "-m", "two");
    const ref = await service.distill(new Date("2026-09-02T03:00:00.000Z"));
    expect(ref).toBe("kb-distill:1");
    expect(
      await fs.readFile(path.join(distillDir(), "knowledge/kb-devrel-wiki-notes-b.md"), "utf8"),
    ).toContain("wiki/notes/b.md");
  });

  it("does not advance the watermark when the model returns nothing", async () => {
    const empty = build([]);
    await empty.distill(new Date("2026-09-01T03:00:00.000Z"));
    // A second pass must reconsider the same file rather than skip it.
    const before = distillCalls.length;
    await empty.distill(new Date("2026-09-02T03:00:00.000Z"));
    expect(distillCalls.length).toBeGreaterThan(before);
  });

  it("chunks a large source into several distiller calls", async () => {
    await fs.writeFile(path.join(root, "wiki/notes/big.md"), "x\n".repeat(30_000), "utf8");
    await git("add", ".");
    await git("commit", "-m", "big");
    await service.distill(new Date("2026-09-01T03:00:00.000Z"));
    const bigCalls = distillCalls.filter((runs) =>
      runs.some((r) => r.name === "wiki/notes/big.md"),
    );
    expect(bigCalls.length).toBeGreaterThan(1);
  });

  it("never distils anything in the excluded zones", async () => {
    await fs.mkdir(path.join(root, "output/zibby-memory/knowledge"), { recursive: true });
    await fs.writeFile(path.join(root, "output/zibby-memory/knowledge/loop.md"), "loop", "utf8");
    await service.distill(new Date("2026-09-01T03:00:00.000Z"));
    const names = distillCalls.flat().map((r) => r.name);
    expect(names.some((n) => n.startsWith("output/"))).toBe(false);
  });

  it("returns kb-distill:0 and writes nothing for a team with no distillPath", async () => {
    const teams = {
      list: async (): Promise<Team[]> => [
        {
          id: "devrel",
          name: "DevRel",
          knowledgeBase: { kind: "vault", path: root, readOnly: true },
        } as Team,
      ],
    } as unknown as TeamsStorageService;
    const off = new KbDistillerService(teams, new KbDistillTargetService(), new KbSourceScanner(), {
      distill: async (): Promise<Learning[]> => [LEARNING],
    } as unknown as ClaudeCliDistiller);
    expect(await off.distill(new Date())).toBe("kb-distill:0");
    expect(await fs.readdir(path.join(root, "output")).catch(() => [])).toEqual([]);
  });

  it("never throws when the distiller model blows up", async () => {
    const teams = {
      list: async (): Promise<Team[]> => [
        { ...team, knowledgeBase: { ...team.knowledgeBase, path: root } } as Team,
      ],
    } as unknown as TeamsStorageService;
    const boom = new KbDistillerService(
      teams,
      new KbDistillTargetService(),
      new KbSourceScanner(),
      {
        distill: async (): Promise<Learning[]> => {
          throw new Error("boom");
        },
      } as unknown as ClaudeCliDistiller,
    );
    await expect(boom.distill(new Date())).resolves.toContain("kb-distill:");
  });

  it("caps a pass and defers the rest", async () => {
    for (let i = 0; i < 15; i++) {
      await fs.writeFile(path.join(root, `wiki/notes/n${i}.md`), `# N${i}\n\nBody.`, "utf8");
    }
    await git("add", ".");
    await git("commit", "-m", "many");
    const ref = await service.distill(new Date("2026-09-01T03:00:00.000Z"));
    const count = Number(ref.split(":")[1]);
    expect(count).toBeLessThanOrEqual(10);
    expect(count).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/api/src/kb/kb-distiller.service.test.ts --project api`
Expected: FAIL — cannot resolve `./kb-distiller.service`.

- [ ] **Step 3: Widen `RunDigest.kind`**

In `apps/api/src/memory/claude-cli-distiller.ts` line 15, change:

```ts
kind: "pipeline" | "agent" | "goal" | "chat" | "note";
```

to:

```ts
kind: "pipeline" | "agent" | "goal" | "chat" | "note" | "kb";
```

- [ ] **Step 4: Implement the service**

Create `apps/api/src/kb/kb-distiller.service.ts`:

```ts
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import type { KnowledgeBaseSource, Team } from "@zibby/contracts";
import { ClaudeCliDistiller, type Learning, type RunDigest } from "../memory/claude-cli-distiller";
import { DuplicateNoteError, VaultService } from "../memory/vault.service";
import { TeamsStorageService } from "../teams/teams.storage.service";
import { KbDistillTargetService } from "./kb-distill-target.service";
import { readState, writeState } from "./kb-distill-state";
import { appendMetaLog, formatMetaLogLine } from "./kb-meta-log";
import { rootPathOf } from "./kb-paths";
import { KbSourceScanner } from "./kb-source-scanner";
import { chunkText, prepareSourceText } from "./kb-source-text";

/**
 * Cap on KB files distilled in one pass. DELIBERATELY separate from the vault
 * distiller's `MAX_RUNS_PER_PASS`: sharing one cap would let a first pass over a
 * large knowledge base starve run/chat/halda distillation for days.
 */
export const MAX_KB_FILES_PER_PASS = 10;

/** A KB-relative path turned into a vault-legal, collision-free note id. */
export function kbNoteIdFor(teamId: string, relPath: string): string {
  const slug = relPath
    .replace(/\.(md|vtt)$/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `kb-${teamId}-${slug}`.slice(0, 120);
}

/**
 * Nightly distillation of every team knowledge base that has opted in with a
 * `distillPath`. The output-side mirror of `KbReaderService`: the reader walks
 * the KB on every query and forgets; this condenses it ONCE per changed file
 * into durable learnings that persist.
 *
 * Structurally parallel to `MemoryDistillerService` and deliberately NOT folded
 * into it: a fourth candidate shape there would share its 30-run cap, and one
 * large KB would then crowd out run/chat/halda distillation. Separate service,
 * separate cap, dispatched from the same `memory-distill` automation.
 *
 * Filing is PER SOURCE FILE, not per pass: a document-shaped source deserves a
 * document-shaped note, which also gives retrieval a real anchor.
 *
 * NEVER throws — every team, and every file within a team, is independently
 * fail-open, mirroring `MemoryDistillerService.distill`.
 */
@Injectable()
export class KbDistillerService {
  private readonly logger = new Logger(KbDistillerService.name);

  constructor(
    private readonly teams: TeamsStorageService,
    private readonly target: KbDistillTargetService,
    private readonly scanner: KbSourceScanner,
    private readonly distiller: ClaudeCliDistiller,
  ) {}

  /** Run one pass across every opted-in team; returns a `kb-distill:<count>` ref. */
  async distill(now: Date = new Date()): Promise<string> {
    let total = 0;
    try {
      const teams = await this.teams.list().catch((): Team[] => []);
      for (const team of teams) {
        const source = team.knowledgeBase;
        if (!source?.distillPath) continue;
        try {
          total += await this.distillTeam(team.id, source, now);
        } catch (error) {
          this.logger.warn(`kb distillation failed for team ${team.id}: ${String(error)}`);
        }
      }
    } catch (error) {
      this.logger.warn(`kb distillation failed: ${String(error)}`);
      return "kb-distill:error";
    }
    return `kb-distill:${total}`;
  }

  /** One team's pass. Returns how many notes it filed. */
  private async distillTeam(
    teamId: string,
    source: KnowledgeBaseSource,
    now: Date,
  ): Promise<number> {
    const distillDir = await this.target.resolve(source);
    if (distillDir === null) return 0;
    const rootPath = rootPathOf(source);
    if (rootPath === null) return 0;
    const root = path.resolve(rootPath);

    const state = await readState(distillDir);
    const head = await this.scanner.headSha(root);

    // Incremental when we have a watermark AND the diff succeeds; otherwise a
    // full walk. A `null` diff (unknown sha after a rebase, non-git KB) must
    // fall back rather than silently distil nothing.
    const changed =
      state.lastSha === null ? null : await this.scanner.changedSince(root, state.lastSha);
    const candidates = changed ?? (await this.scanner.listAll(root));

    const selected = candidates.slice(0, MAX_KB_FILES_PER_PASS);
    const deferred = candidates.length - selected.length;
    if (deferred > 0) {
      this.logger.log(
        `kb distill cap reached for ${teamId} — deferring ${deferred} file(s) to the next pass`,
      );
    }
    if (selected.length === 0) {
      // Nothing to do, but record that we looked — so the next pass diffs from
      // here rather than re-walking the whole KB.
      if (head !== null && head !== state.lastSha) {
        await writeState(distillDir, { lastSha: head, lastRunAt: now.toISOString() });
      }
      return 0;
    }

    const vault = new VaultService(distillDir);
    await vault.onModuleInit();

    let filed = 0;
    for (const relPath of selected) {
      try {
        if (await this.distillFile(vault, teamId, root, relPath, head, now)) filed++;
      } catch (error) {
        this.logger.warn(`kb distill failed for ${relPath}: ${String(error)}`);
      }
    }

    // Advance the watermark ONLY when the whole selected batch was filed and
    // nothing was deferred — at-least-once, matching the vault distiller's
    // "mark only after the digest is filed" posture. A duplicated learning is
    // harmless; a dropped one is not.
    if (filed === selected.length && deferred === 0 && head !== null) {
      await writeState(distillDir, { lastSha: head, lastRunAt: now.toISOString() });
    }

    if (filed > 0) {
      const line = formatMetaLogLine(now, source.distillPath ?? "", filed, selected.length);
      const logged = await appendMetaLog(root, line);
      if (!logged) {
        this.logger.warn(`could not append the provenance line to ${root}/_meta/log.md`);
      }
    }
    return filed;
  }

  /** Distil ONE KB file into ONE note. Returns true when a note was written. */
  private async distillFile(
    vault: VaultService,
    teamId: string,
    root: string,
    relPath: string,
    head: string | null,
    now: Date,
  ): Promise<boolean> {
    const raw = await fs.readFile(path.resolve(root, relPath), "utf8").catch(() => null);
    if (raw === null) return false;
    const chunks = chunkText(prepareSourceText(relPath, raw));
    if (chunks.length === 0) return false;

    const learnings: Learning[] = [];
    for (const [index, excerpt] of chunks.entries()) {
      const digest: RunDigest = {
        kind: "kb",
        id: `${relPath}#${index}`,
        name: relPath,
        status: "kb",
        excerpt,
      };
      learnings.push(...(await this.distiller.distill([digest])));
    }
    if (learnings.length === 0) return false;

    const noteId = kbNoteIdFor(teamId, relPath);
    const body = this.render(relPath, dedupeLearnings(learnings));
    const frontmatter = {
      sources: [relPath],
      distilledAt: now.toISOString(),
      ...(head !== null ? { distilledThroughSha: head } : {}),
      team: teamId,
    };
    const tags = [...new Set(learnings.flatMap((l) => l.tags))].sort();
    const input = {
      id: noteId,
      tier: "knowledge" as const,
      title: `KB — ${relPath}`,
      body,
      frontmatter,
      ...(tags.length > 0 ? { tags } : {}),
    };
    try {
      await vault.createNote(input);
    } catch (error) {
      // The file changed and is being re-distilled: replace the note's content
      // rather than filing a second one (per-source-file grouping is the point).
      // `UpdateNoteInput` has no top-level `tags` (only title/body/frontmatter/raw),
      // so tags ride inside `frontmatter` here — which is where `createNote`
      // persists them anyway (`data.tags = input.tags`).
      if (!(error instanceof DuplicateNoteError)) throw error;
      await vault.updateNote(noteId, {
        title: input.title,
        body,
        frontmatter: { ...frontmatter, ...(tags.length > 0 ? { tags } : {}) },
      });
    }
    return true;
  }

  private render(relPath: string, learnings: Learning[]): string {
    return [
      `Poznatky destilované ze zdroje \`${relPath}\` v týmové knowledge base.`,
      ...learnings.map((l) => `## ${l.title}\n\n${l.body}`),
    ].join("\n\n");
  }
}

/** Drop chunk-to-chunk repeats of the same learning (same title, case-insensitive). */
function dedupeLearnings(learnings: Learning[]): Learning[] {
  const seen = new Set<string>();
  return learnings.filter((l) => {
    const key = l.title.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/api/src/kb/kb-distiller.service.test.ts --project api`
Expected: PASS (13 tests).

- [ ] **Step 6: Verify the vault distiller still passes (the `RunDigest` widening)**

Run: `pnpm exec vitest run apps/api/src/memory/memory-distiller.service.test.ts apps/api/src/memory/claude-cli-distiller.test.ts --project api`
Expected: PASS.

- [ ] **Step 7: Format, lint, commit**

```bash
pnpm exec prettier --write apps/api/src/kb/kb-distiller.service.ts apps/api/src/kb/kb-distiller.service.test.ts apps/api/src/memory/claude-cli-distiller.ts
pnpm exec eslint --fix apps/api/src/kb/kb-distiller.service.ts apps/api/src/kb/kb-distiller.service.test.ts apps/api/src/memory/claude-cli-distiller.ts
git add apps/api/src/kb/kb-distiller.service.ts apps/api/src/kb/kb-distiller.service.test.ts apps/api/src/memory/claude-cli-distiller.ts
git commit -m "feat(kb): distil a team knowledge base into per-source durable learnings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Module wiring + nightly dispatch

**Files:**

- Create: `apps/api/src/kb/kb-distiller.module.ts`
- Modify: `apps/api/src/automations/scheduler.service.ts`
- Modify: `apps/api/src/automations/automations.module.ts`
- Modify: `docs/api/memory.md`
- Test: `apps/api/src/automations/scheduler.service.test.ts`

**Interfaces:**

- Consumes: `KbDistillerService.distill()` (Task 7).
- Produces: the `memory-distill` automation runs both passes; its ref becomes `memory-distill:<n> kb-distill:<m>`.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/automations/scheduler.service.test.ts` (adapt the existing `memory-distill` test's harness — it already constructs `SchedulerService` with stub collaborators; add a `kbDistiller` stub in the same style):

```ts
it("memory-distill runs the vault pass AND the KB pass, and reports both", async () => {
  const calls: string[] = [];
  const distiller = {
    distill: async (): Promise<string> => {
      calls.push("vault");
      return "memory-distill:2";
    },
  };
  const kbDistiller = {
    distill: async (): Promise<string> => {
      calls.push("kb");
      return "kb-distill:3";
    },
  };
  const scheduler = buildScheduler({ distiller, kbDistiller });

  const ref = await scheduler.dispatchForTest({ type: "memory-distill" });

  expect(calls).toEqual(["vault", "kb"]);
  expect(ref).toBe("memory-distill:2 kb-distill:3");
});

it("memory-distill still reports the vault pass when the KB pass throws", async () => {
  const distiller = { distill: async (): Promise<string> => "memory-distill:2" };
  const kbDistiller = {
    distill: async (): Promise<string> => {
      throw new Error("boom");
    },
  };
  const scheduler = buildScheduler({ distiller, kbDistiller });

  await expect(scheduler.dispatchForTest({ type: "memory-distill" })).resolves.toBe(
    "memory-distill:2 kb-distill:error",
  );
});
```

If the existing test file has no `buildScheduler` helper or no way to reach `dispatch`, mirror exactly how the file's existing `memory-distill` / `briefing` cases are exercised — do not invent a new harness.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/api/src/automations/scheduler.service.test.ts --project api`
Expected: FAIL — the KB pass is not called; the ref is `memory-distill:2`.

- [ ] **Step 3: Create the module**

Create `apps/api/src/kb/kb-distiller.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { ClaudeCliDistiller } from "../memory/claude-cli-distiller";
import { TeamsModule } from "../teams/teams.module";
import { KbDistillTargetService } from "./kb-distill-target.service";
import { KbDistillerService } from "./kb-distiller.service";
import { KbSourceScanner } from "./kb-source-scanner";

/**
 * Nightly knowledge-base distillation. Deliberately does NOT import
 * `MemoryModule`: the per-team `VaultService` here is bound to the KB's distill
 * directory, not to `VAULT_DIR`, so it is constructed directly rather than
 * injected — one instance per team root, and no DI edge that could close a
 * cycle through Memory. `ClaudeCliDistiller` is re-provided for the same reason
 * `MemoryDistillerModule` provides it: it is a stateless CLI wrapper, and a
 * second instance cannot diverge from the first.
 *
 * `AutomationsModule` imports this so the scheduler can dispatch the KB half of
 * the `memory-distill` system automation.
 */
@Module({
  imports: [TeamsModule],
  providers: [ClaudeCliDistiller, KbDistillTargetService, KbSourceScanner, KbDistillerService],
  exports: [KbDistillerService],
})
export class KbDistillerModule {}
```

If `TeamsModule` does not export `TeamsStorageService`, re-provide it here with its `TEAMS_DIR` factory instead, following the pattern `MemoryModule` uses for `PROJECTS_DIR`/`ProjectsStorageService`.

- [ ] **Step 4: Wire the scheduler**

In `apps/api/src/automations/scheduler.service.ts`:

Add the import:

```ts
import { KbDistillerService } from "../kb/kb-distiller.service";
```

Add the constructor parameter after `private readonly distiller: MemoryDistillerService,`:

```ts
    private readonly kbDistiller: KbDistillerService,
```

Replace the `memory-distill` case body with:

```ts
      case "memory-distill": {
        // Nightly system automation: distil durable learnings out of finished runs
        // into the vault, THEN out of every opted-in team knowledge base into its
        // own distill folder. Two passes, two caps, independent failure: a broken
        // KB must never cost the vault pass its result, so the KB half is caught
        // here rather than allowed to reject the whole dispatch.
        const vaultRef = await this.distiller.distill();
        const kbRef = await this.kbDistiller
          .distill()
          .catch(() => "kb-distill:error" as const);
        return `${vaultRef} ${kbRef}`;
      }
```

- [ ] **Step 5: Wire the module**

In `apps/api/src/automations/automations.module.ts`, add `KbDistillerModule` to the `imports` array and its import statement:

```ts
import { KbDistillerModule } from "../kb/kb-distiller.module";
```

- [ ] **Step 6: Run the scheduler tests to verify they pass**

Run: `pnpm exec vitest run apps/api/src/automations/scheduler.service.test.ts --project api`
Expected: PASS.

- [ ] **Step 7: Verify the app still boots (DI graph intact)**

Run: `pnpm exec vitest run apps/api/test --project api`
Expected: PASS — the e2e suites boot the full `AppModule`, so a DI cycle or a missing provider fails here.

- [ ] **Step 8: Document it**

Append to `docs/api/memory.md` a `## Knowledge-base distillation` section covering: `distillPath` opt-in and its `output/` constraint; per-source-file notes; `.state.json` incrementality; `MAX_KB_FILES_PER_PASS`; the `_meta/log.md` provenance append and that the operator commits it; and that the distillate is per-user and gitignored.

- [ ] **Step 9: Format, lint, commit**

```bash
pnpm exec prettier --write apps/api/src/kb/kb-distiller.module.ts apps/api/src/automations/scheduler.service.ts apps/api/src/automations/automations.module.ts apps/api/src/automations/scheduler.service.test.ts docs/api/memory.md
pnpm exec eslint --fix apps/api/src/kb/kb-distiller.module.ts apps/api/src/automations/scheduler.service.ts apps/api/src/automations/automations.module.ts apps/api/src/automations/scheduler.service.test.ts
git add apps/api/src/kb/kb-distiller.module.ts apps/api/src/automations/scheduler.service.ts apps/api/src/automations/automations.module.ts apps/api/src/automations/scheduler.service.test.ts docs/api/memory.md
git commit -m "feat(kb): dispatch KB distillation from the nightly memory-distill automation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Enable it for DevRel and verify against the real KB

**Files:**

- Modify: `.zibby/data/teams/_teams.json`

**Interfaces:**

- Consumes: everything above.
- Produces: nothing — this is the acceptance step.

- [ ] **Step 1: Confirm the KB is clean before touching it**

```bash
git -C /Users/zibar/Workspace/devrel-knowledgebase status --short
```

Expected: empty. If it is not, STOP and report — the operator has uncommitted KB work, and a distill pass would add a `_meta/log.md` change on top of it.

- [ ] **Step 2: Add `distillPath` to the DevRel team**

In `.zibby/data/teams/_teams.json`, add to `devrel`'s `knowledgeBase` object:

```json
      "distillPath": "output/zibby-memory"
```

- [ ] **Step 3: Trigger one pass**

Start the API (`pnpm api:dev`) and trigger the `memory-distill` automation from the Automations screen (or `POST /api/automations/memory-distill/trigger`).

- [ ] **Step 4: Verify the output**

```bash
ls /Users/zibar/Workspace/devrel-knowledgebase/output/zibby-memory/knowledge/
cat /Users/zibar/Workspace/devrel-knowledgebase/output/zibby-memory/.state.json
git -C /Users/zibar/Workspace/devrel-knowledgebase status --short
```

Expected: up to `MAX_KB_FILES_PER_PASS` notes (the five `meetings/*.vtt` files are the only distillable content today); a `.state.json` carrying `lastSha`; and `git status` showing **only** ` M _meta/log.md` — nothing under `output/` may appear, since it is gitignored. If anything under `output/` shows as untracked, the KB's `.gitignore` is not covering the distill folder — STOP and report.

- [ ] **Step 5: Verify incrementality**

Trigger the automation a second time with no KB change.

Expected: the run ref ends `kb-distill:0`, no new notes, and **no second line** appended to `_meta/log.md`.

- [ ] **Step 6: Read one note and judge quality**

Open one of the generated notes. This is the Phase A acceptance gate: the learnings must be durable and reusable, not a meeting summary. If they read as episodic recap, tune `DISTILLER_SYSTEM_PROMPT`'s KB framing before starting Phase B or C — both depend on this distillate being worth reading.

- [ ] **Step 7: Commit the config**

```bash
git add .zibby/data/teams/_teams.json
git commit -m "chore(teams): enable KB distillation for DevRel

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

The KB repo's dirty `_meta/log.md` is the operator's to commit, in that repo — not this one.

---

## Self-Review Notes

**Spec coverage:** §5.1 → Task 1. §5.2 → Task 3. §5.3 steps 1–3 → Task 5, step 4 → Task 4, steps 5–8 → Task 7, step 9 → Task 6 + 7, step 10 → Task 7. §5.4 → Task 6. §5.5 → Task 7 (mini-vault via `new VaultService(distillDir)`). §5.6 → Task 8. §11 testing bullets for Phase A → Tasks 1–8; the Phase B/C bullets are out of scope here by design.

**Deliberately deferred to Phase B/C (not gaps):** the Memory-section second read root, the `origin` contract field, id prefixing on read, grounding and `KbReaderService` distill-first ranking, staleness marking at retrieval time. Phase A writes `distilledThroughSha` into every note so C can compute staleness without a migration.

**Known follow-up, named not hidden:** the watermark advances only when every selected file filed AND nothing was deferred. On a KB where one file consistently yields no learnings, the watermark never advances and that file is re-distilled every night. Acceptable now (five files, all substantive); revisit with a per-file `attemptedSha` if it bites.
