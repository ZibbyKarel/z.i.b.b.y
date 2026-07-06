# Entity Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give agents and pipelines an optional `avatar` image that replaces the glyph everywhere the entity is shown (cards, pipeline nodes, chat identity, quick-launch) and add a profile-style avatar hero to their detail/edit views; ship six default avatars for the delivery-loop identities.

**Architecture:** Extend the existing project-logo pattern (`Project.logo` data URI → `IconTile src` with glyph fallback) to agents and pipelines. A new presentational `EntityHero` DS component renders the profile band; small avatars everywhere else reuse `IconTile src`. Defaults ship as static PNGs under `apps/web/public/avatars/` and are referenced by a short path in entity frontmatter; user uploads are stored as data URIs in the same field.

**Tech Stack:** Zod + ts-rest contracts (`libs/contracts`), NestJS Markdown-backed storage (`apps/api`), Next.js 15 + React 19 + Tailwind v4 design system, TanStack Query, Vitest.

## Global Constraints

- Package manager is **pnpm** — never npm/yarn.
- TypeScript `strict` + `noUncheckedIndexedAccess`; **no `any`**; no `forwardRef` (React 19 ref-as-prop).
- No inline `style={{…}}` on raw DOM elements in `apps/web` (ESLint `react/forbid-dom-props`) — compose DS primitives or use a DS component's `style` passthrough. DS components (`libs/design-system`) MAY style themselves; dynamic values go through their own `style`.
- Every DS component declares a `<Component>TestId` enum and wires `data-testid`; tests select via `getByTestId`, keep roles/ARIA as assertions only.
- DS is i18n-agnostic — English default string props; `apps/web` overrides with `t()`. Catalogs: `apps/web/i18n/messages/{cs,en}.json`, flat keys, default locale `cs`.
- `avatar` field value is EITHER a `data:image/…` URI OR a `/`-rooted path — nothing else.
- Avatar data-URI size cap: **280 000 chars** (`.max(280_000)` on the contract; enforced app-side on upload).
- After code changes run, in order: `pnpm lint` → `pnpm typecheck` → `pnpm test`. Fix all before done. (`pnpm typecheck` may not cover `apps/web`; run `npx tsc -p apps/web/tsconfig.json --noEmit` too — a base config gotcha.)
- Design source project (DesignSync): projectId `2bfb0ce6-c019-4075-a176-38d7fcf25345`, avatar files `zibby/avatars/{architect,coder,tester,reviewer,documentator,orchestrator}.png`.

---

### Task 1: Contract — `avatar` field on agent, pipeline, and task targets

**Files:**
- Modify: `libs/contracts/src/agents/agent.schema.ts:41`
- Modify: `libs/contracts/src/pipelines/pipeline.schema.ts:113-121`
- Modify: `libs/contracts/src/tasks/task.schema.ts:25-30`
- Test: `libs/contracts/src/agents/agent.schema.test.ts` (create if absent) or the existing contracts test file

**Interfaces:**
- Produces: an optional `avatar?: string` on `Agent`, `Pipeline`, and every `TaskTarget` display shape. Constant `AVATAR_MAX = 280_000`. A shared `AvatarSchema` others import.

- [ ] **Step 1: Write the failing test**

Create `libs/contracts/src/agents/avatar.schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AgentSchema } from "./agent.schema";
import { PipelineSchema } from "../pipelines/pipeline.schema";

const baseAgent = { id: "architect", instructions: "do things" };
const basePipeline = {
  id: "delivery",
  instructions: "chain",
  phases: [{ id: "p1", type: "agent", agent: "architect", model: "opus", thinking: "high", consumes: "a.md", produces: "b.md" }],
};

describe("avatar field", () => {
  it("accepts a root-relative path", () => {
    expect(AgentSchema.parse({ ...baseAgent, avatar: "/avatars/architect.png" }).avatar).toBe("/avatars/architect.png");
    expect(PipelineSchema.parse({ ...basePipeline, avatar: "/avatars/orchestrator.png" }).avatar).toBe("/avatars/orchestrator.png");
  });
  it("accepts a data URI", () => {
    expect(AgentSchema.parse({ ...baseAgent, avatar: "data:image/png;base64,AAAA" }).avatar).toBe("data:image/png;base64,AAAA");
  });
  it("rejects an arbitrary external URL", () => {
    expect(AgentSchema.safeParse({ ...baseAgent, avatar: "https://evil.example/x.png" }).success).toBe(false);
    expect(PipelineSchema.safeParse({ ...basePipeline, avatar: "http://evil/x.png" }).success).toBe(false);
  });
  it("is optional", () => {
    expect(AgentSchema.parse(baseAgent).avatar).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run libs/contracts/src/agents/avatar.schema.test.ts`
Expected: FAIL — `avatar` accepted for the external URL case (field not yet constrained) / property missing.

- [ ] **Step 3: Add the shared avatar schema and wire it in**

In `libs/contracts/src/common.schema.ts` add (near the other shared schemas):

```ts
/** Max length of an avatar data URI (~200 KB of base64), the storage backstop. */
export const AVATAR_MAX = 280_000;

/**
 * An entity avatar: either an uploaded `data:image/*` URI or a `/`-rooted path to
 * a bundled static asset (`/avatars/architect.png`). Anything else — notably an
 * external `http(s)://` URL — is rejected, so inbound data can never point the UI
 * at a fetch it shouldn't make.
 */
export const AvatarSchema = z
  .string()
  .max(AVATAR_MAX)
  .refine((v) => v.startsWith("data:image/") || v.startsWith("/"), {
    message: "avatar must be a data:image/ URI or a root-relative path",
  });
```

In `agent.schema.ts` add `import { AvatarSchema } from "../common.schema";` (extend the existing `RiskSchema` import) and add after line 41 (`glyph`):

```ts
  /** Optional avatar image (data URI or `/avatars/*.png` path) shown in place of the glyph. */
  avatar: AvatarSchema.optional(),
```

In `pipeline.schema.ts` add `AvatarSchema` to the `../common.schema`? — it currently imports only from `../agents/agent.schema`. Add `import { AvatarSchema } from "../common.schema";` and inside `PipelineObject` (after `id`, line 114) add:

```ts
  avatar: AvatarSchema.optional(),
```

In `task.schema.ts` add `import { AvatarSchema } from "../common.schema";` and extend `taskTargetDisplayShape` (line 25):

```ts
const taskTargetDisplayShape = {
  name: z.string().min(1),
  glyph: z.string().optional(),
  /** Optional avatar (data URI or `/avatars/*.png` path); overrides the glyph in chat/HUD. */
  avatar: AvatarSchema.optional(),
  /** Free-form functional area, when the definition carries one. */
  category: z.string().optional(),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run libs/contracts/src/agents/avatar.schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck the contracts lib**

Run: `npx tsc -p libs/contracts/tsconfig.lib.json --noEmit` (or `pnpm typecheck`)
Expected: no errors. `CreateAgentSchema`/`UpdateAgentSchema`, `CreatePipelineSchema`/`UpdatePipelineSchema` derive `avatar` automatically.

- [ ] **Step 6: Commit**

```bash
git add libs/contracts/src
git commit -m "feat(contracts): add avatar field to agent, pipeline, task targets"
```

---

### Task 2: API storage — persist `avatar` in agent & pipeline frontmatter

**Files:**
- Modify: `apps/api/src/agents/agents.storage.service.ts:114,147`
- Modify: `apps/api/src/pipelines/pipelines.storage.service.ts:103-107,112-119`
- Test: `apps/api/src/pipelines/pipelines.storage.service.test.ts` (extend), and the agents storage test (find `apps/api/src/agents/agents.storage.service.test.ts`)

**Interfaces:**
- Consumes: `Agent.avatar`, `Pipeline.avatar` from Task 1.
- Produces: `avatar` round-trips through `.md` frontmatter on both stores.

- [ ] **Step 1: Write the failing test (pipeline store round-trip)**

In `apps/api/src/pipelines/pipelines.storage.service.test.ts`, add a case in the existing describe block (mirror the surrounding create/get style):

```ts
it("round-trips the avatar field", async () => {
  const created = await store.create({
    id: "with-avatar",
    name: "With Avatar",
    avatar: "/avatars/orchestrator.png",
    instructions: "body",
    phases: [
      { id: "p1", type: "agent", agent: "architect", model: "opus", thinking: "high", consumes: "a.md", produces: "b.md" },
    ],
    outputs: [],
  });
  expect(created.avatar).toBe("/avatars/orchestrator.png");
  const read = await store.get("with-avatar");
  expect(read.avatar).toBe("/avatars/orchestrator.png");
});
```

Add the analogous test to the agents storage test file (using its existing `create`/`get` harness, `avatar: "/avatars/architect.png"`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run apps/api/src/pipelines/pipelines.storage.service.test.ts apps/api/src/agents/agents.storage.service.test.ts`
Expected: FAIL — `read.avatar` is `undefined` (not persisted).

- [ ] **Step 3: Thread `avatar` through the agent store**

In `agents.storage.service.ts` `fromFrontmatter` (after line 114, the `glyph` line):

```ts
    if (typeof data.avatar === "string") candidate.avatar = data.avatar;
```

In `toFrontmatter` (after line 147, the `glyph` line):

```ts
    if (agent.avatar !== undefined) data.avatar = agent.avatar;
```

- [ ] **Step 4: Thread `avatar` through the pipeline store**

In `pipelines.storage.service.ts` `fromFrontmatter` (after line 104, the `desc` line):

```ts
    if (typeof data.avatar === "string") candidate.avatar = data.avatar;
```

In `toFrontmatter` (after line 117, the `desc` line):

```ts
    if (pipeline.avatar !== undefined) data.avatar = pipeline.avatar;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/api/src/pipelines/pipelines.storage.service.test.ts apps/api/src/agents/agents.storage.service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/agents/agents.storage.service.ts apps/api/src/pipelines/pipelines.storage.service.ts apps/api/src/agents/agents.storage.service.test.ts apps/api/src/pipelines/pipelines.storage.service.test.ts
git commit -m "feat(api): persist avatar in agent and pipeline frontmatter"
```

---

### Task 3: API — carry `avatar` onto task routing targets (chat identity)

**Files:**
- Modify: `apps/api/src/tasks/task-classifier.service.ts:190-206`
- Modify: `apps/api/src/tasks/task-router.ts:16-24`
- Test: `apps/api/src/tasks/task-router.test.ts` (create/extend)

**Interfaces:**
- Consumes: `Agent.avatar`, `Pipeline.avatar`; `RoutableTarget` (= `CatalogTaskTarget & { search }`).
- Produces: `toTaskTarget()` output includes `avatar`; classifier candidates carry `avatar`.

- [ ] **Step 1: Write the failing test**

Create/extend `apps/api/src/tasks/task-router.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toTaskTarget, type RoutableTarget } from "./task-router";

it("preserves avatar when projecting to the wire target", () => {
  const candidate: RoutableTarget = {
    kind: "agent",
    id: "architect",
    name: "Architekt",
    glyph: "compass",
    avatar: "/avatars/architect.png",
    category: "Delivery",
    search: "architect",
  };
  expect(toTaskTarget(candidate).avatar).toBe("/avatars/architect.png");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/api/src/tasks/task-router.test.ts`
Expected: FAIL — `avatar` missing on `toTaskTarget` output (and TS error: object literal has `avatar` not in `RoutableTarget`… which resolves once Task 1's `CatalogTaskTarget` carries it — confirm it does).

- [ ] **Step 3: Add `avatar` to `toTaskTarget`**

In `task-router.ts` `toTaskTarget` (line 17-23), add `avatar: candidate.avatar,`:

```ts
  return {
    kind: candidate.kind,
    id: candidate.id,
    name: candidate.name,
    glyph: candidate.glyph,
    avatar: candidate.avatar,
    category: candidate.category,
  };
```

- [ ] **Step 4: Populate `avatar` on classifier candidates**

In `task-classifier.service.ts`, in the agent map (line 190) add `avatar: a.avatar,` and in the pipeline map (line 199) add `avatar: p.avatar,` (both alongside `glyph`).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run apps/api/src/tasks/task-router.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tasks/task-router.ts apps/api/src/tasks/task-classifier.service.ts apps/api/src/tasks/task-router.test.ts
git commit -m "feat(api): carry avatar onto task routing targets"
```

---

### Task 4: Default avatar assets + seed frontmatter

**Files:**
- Create: `apps/web/public/avatars/{architect,coder,tester,reviewer,documentator,orchestrator}.png`
- Modify: `.zibby/data/agents/{architect,fullstack-developer,code-reviewer,test-automator,documentation-engineer}.md`
- Modify: `.zibby/data/pipelines/delivery.pipeline.md`

**Interfaces:** none (assets + seed data).

- [ ] **Step 1: Download the six PNGs (base64 kept out of the main context)**

Dispatch a general-purpose subagent with this instruction (it has DesignSync via ToolSearch):

> Using the DesignSync tool, for projectId `2bfb0ce6-c019-4075-a176-38d7fcf25345`, call `get_file` for each path below (they return `isBase64: true` PNG content). Base64-decode each and write the bytes to the target file. Do NOT print the base64 into your final message — just confirm sizes.
> - `zibby/avatars/architect.png` → `apps/web/public/avatars/architect.png`
> - `zibby/avatars/coder.png` → `apps/web/public/avatars/coder.png`
> - `zibby/avatars/tester.png` → `apps/web/public/avatars/tester.png`
> - `zibby/avatars/reviewer.png` → `apps/web/public/avatars/reviewer.png`
> - `zibby/avatars/documentator.png` → `apps/web/public/avatars/documentator.png`
> - `zibby/avatars/orchestrator.png` → `apps/web/public/avatars/orchestrator.png`
> Decode with: write the base64 string to a temp file, then `base64 -D -i tmp.b64 -o target.png` (macOS). Report the byte size of each written PNG.

- [ ] **Step 2: Verify the assets exist and are valid PNGs**

Run: `file apps/web/public/avatars/*.png && ls -la apps/web/public/avatars/`
Expected: six entries, each `PNG image data`.

- [ ] **Step 3: Seed the live agent frontmatter**

Add an `avatar:` line to each agent file's YAML frontmatter (next to `glyph`/`model`):
- `.zibby/data/agents/architect.md` → `avatar: /avatars/architect.png`
- `.zibby/data/agents/fullstack-developer.md` → `avatar: /avatars/coder.png`
- `.zibby/data/agents/code-reviewer.md` → `avatar: /avatars/reviewer.png`
- `.zibby/data/agents/test-automator.md` → `avatar: /avatars/tester.png`
- `.zibby/data/agents/documentation-engineer.md` → `avatar: /avatars/documentator.png`

(If a listed file does not exist, run `ls .zibby/data/agents/ | grep -iE 'architect|fullstack|coder|review|test|doc'` and map to the closest delivery-loop agent id; note any substitution in the commit body.)

- [ ] **Step 4: Seed the delivery pipeline frontmatter**

In `.zibby/data/pipelines/delivery.pipeline.md`, add to the frontmatter: `avatar: /avatars/orchestrator.png`.

- [ ] **Step 5: Verify frontmatter parses (no test framework — just the app boot path)**

Run: `pnpm exec vitest run apps/api/src/agents/agents.storage.service.test.ts` (sanity that nothing broke) and visually confirm each edited `.md` still has valid YAML (`---` fences intact).

- [ ] **Step 6: Commit**

```bash
git add apps/web/public/avatars .zibby/data/agents .zibby/data/pipelines/delivery.pipeline.md
git commit -m "feat: ship default avatars and seed delivery-loop entities"
```

---

### Task 5: Design system — `EntityHero` component

**Files:**
- Create: `libs/design-system/src/components/EntityHero/EntityHero.tsx`
- Create: `libs/design-system/src/components/EntityHero/EntityHero.stories.tsx`
- Create: `libs/design-system/src/components/EntityHero/EntityHero.test.tsx`
- Create: `libs/design-system/src/components/EntityHero/index.ts`
- Modify: `libs/design-system/src/index.ts` (export)

**Interfaces:**
- Produces:
  ```ts
  enum EntityHeroTestId { Root, Image, GlyphFallback, UploadButton, RemoveButton, FileInput, Name }
  interface EntityHeroProps {
    image?: string;
    glyph: IconName;
    name: string;
    meta?: ReactNode;
    desc?: string;
    tag?: ReactNode;
    height?: number;            // default 190
    fit?: "cover" | "contain";  // default "cover"
    editable?: boolean;         // default false
    onUpload?: (dataUri: string) => void;
    onRemove?: () => void;
    uploadLabel?: string;       // default "Upload image"
    removeLabel?: string;       // default "Remove image"
    placeholder?: string;       // default "Upload image"
  }
  function EntityHero(props: EntityHeroProps): JSX.Element
  ```

> Use the `scaffold-component` skill or `design-system` skill to generate the file skeleton, then fill in the body below. Match neighbouring components' Tailwind-class idiom.

- [ ] **Step 1: Write the failing test**

`libs/design-system/src/components/EntityHero/EntityHero.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntityHero, EntityHeroTestId } from "./EntityHero";

describe("EntityHero", () => {
  it("renders the image when one is supplied", () => {
    render(<EntityHero image="/avatars/architect.png" glyph="compass" name="Architekt" />);
    const img = screen.getByTestId(EntityHeroTestId.Image);
    expect(img).toHaveAttribute("src", "/avatars/architect.png");
    expect(screen.getByTestId(EntityHeroTestId.Name)).toHaveTextContent("Architekt");
  });

  it("falls back to the glyph when there is no image", () => {
    render(<EntityHero glyph="compass" name="Architekt" />);
    expect(screen.queryByTestId(EntityHeroTestId.Image)).toBeNull();
    expect(screen.getByTestId(EntityHeroTestId.GlyphFallback)).toBeInTheDocument();
  });

  it("falls back to the glyph when the image fails to load", () => {
    render(<EntityHero image="/broken.png" glyph="compass" name="X" />);
    fireEvent.error(screen.getByTestId(EntityHeroTestId.Image));
    expect(screen.getByTestId(EntityHeroTestId.GlyphFallback)).toBeInTheDocument();
  });

  it("emits a data URI via onUpload when editable", async () => {
    const onUpload = vi.fn();
    render(<EntityHero glyph="compass" name="X" editable onUpload={onUpload} />);
    const input = screen.getByTestId(EntityHeroTestId.FileInput) as HTMLInputElement;
    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await vi.waitFor(() => expect(onUpload).toHaveBeenCalledWith(expect.stringMatching(/^data:/)));
  });

  it("hides upload/remove controls when not editable", () => {
    render(<EntityHero image="/a.png" glyph="compass" name="X" />);
    expect(screen.queryByTestId(EntityHeroTestId.FileInput)).toBeNull();
    expect(screen.queryByTestId(EntityHeroTestId.RemoveButton)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run libs/design-system/src/components/EntityHero/EntityHero.test.tsx`
Expected: FAIL — module not found / `EntityHero` undefined.

- [ ] **Step 3: Implement the component**

`libs/design-system/src/components/EntityHero/EntityHero.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { cn } from "../../utils/cn";
import type { IconName } from "../Icon/Icon";
import { Icon } from "../Icon/Icon";

export enum EntityHeroTestId {
  Root = "entity-hero-root",
  Image = "entity-hero-image",
  GlyphFallback = "entity-hero-glyph",
  UploadButton = "entity-hero-upload",
  RemoveButton = "entity-hero-remove",
  FileInput = "entity-hero-file",
  Name = "entity-hero-name",
}

export interface EntityHeroProps {
  /** Avatar image (data URI or `/avatars/*.png` path). Absent → glyph placeholder. */
  image?: string;
  /** Fallback glyph shown when there is no image (or it fails to load). */
  glyph: IconName;
  /** Entity name, overlaid at the bottom of the band. */
  name: string;
  /** Optional node under the name (category, phase count…). */
  meta?: ReactNode;
  /** Optional node above the name (a pill/badge). */
  tag?: ReactNode;
  /** Short description under the name. */
  desc?: string;
  /** Band height in px. */
  height?: number;
  /** How the image fills the band — `contain` for wide art, `cover` for portraits. */
  fit?: "cover" | "contain";
  /** Enable upload / drag-drop / remove. */
  editable?: boolean;
  onUpload?: (dataUri: string) => void;
  onRemove?: () => void;
  uploadLabel?: string;
  removeLabel?: string;
  placeholder?: string;
}

function readAsDataUri(file: File, onUpload?: (v: string) => void) {
  if (!file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") onUpload?.(reader.result);
  };
  reader.readAsDataURL(file);
}

/**
 * Profile-style hero for an agent or pipeline: the avatar fills a band with the
 * name/meta/desc overlaid at the bottom and dissolving into the panel below.
 * When `editable`, it uploads (click or drag-drop) a file and emits a data URI;
 * the caller enforces any size cap. Falls back to `glyph` when the image is
 * absent or fails to load.
 */
export function EntityHero({
  image,
  glyph,
  name,
  meta,
  tag,
  desc,
  height = 190,
  fit = "cover",
  editable = false,
  onUpload,
  onRemove,
  uploadLabel = "Upload image",
  removeLabel = "Remove image",
  placeholder = "Upload image",
}: EntityHeroProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);
  const [tracked, setTracked] = useState(image);
  if (image !== tracked) {
    setTracked(image);
    setFailed(false);
  }
  const showImage = Boolean(image) && !failed;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden",
        showImage ? "bg-background" : "bg-accent-dim",
      )}
      data-testid={EntityHeroTestId.Root}
      onDragOver={editable ? (e) => e.preventDefault() : undefined}
      onDrop={
        editable
          ? (e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) readAsDataUri(file, onUpload);
            }
          : undefined
      }
      style={{ height }}
    >
      {showImage ? (
        <img
          alt=""
          className={cn("absolute inset-0 h-full w-full", fit === "cover" ? "object-cover" : "object-contain")}
          data-testid={EntityHeroTestId.Image}
          onError={() => setFailed(true)}
          src={image}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-accent/25" data-testid={EntityHeroTestId.GlyphFallback}>
          <Icon name={glyph} size="xl" />
        </div>
      )}

      {/* dissolve the image into the panel below */}
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/55 to-transparent" />

      {editable && (
        <div className="absolute top-3 right-3 z-10 flex gap-2">
          <button
            className="grid size-7 place-items-center rounded-sm border border-border bg-background/70 text-foreground backdrop-blur-sm"
            data-testid={EntityHeroTestId.UploadButton}
            onClick={() => inputRef.current?.click()}
            title={uploadLabel}
            type="button"
          >
            <Icon name={image ? "edit" : "upload"} size="sm" />
          </button>
          {image && (
            <button
              className="grid size-7 place-items-center rounded-sm border border-danger/50 bg-background/70 text-danger backdrop-blur-sm"
              data-testid={EntityHeroTestId.RemoveButton}
              onClick={() => onRemove?.()}
              title={removeLabel}
              type="button"
            >
              <Icon name="trash" size="sm" />
            </button>
          )}
          <input
            accept="image/*"
            className="hidden"
            data-testid={EntityHeroTestId.FileInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) readAsDataUri(file, onUpload);
            }}
            ref={inputRef}
            type="file"
          />
        </div>
      )}

      {editable && !image && (
        <div className="absolute top-3.5 left-4 flex items-center gap-2 text-accent">
          <Icon name="image" size="sm" />
          <span className="font-mono text-[10px] tracking-wider uppercase">{placeholder}</span>
        </div>
      )}

      <div className="absolute right-5 bottom-3.5 left-5 z-[1]">
        {tag && <div className="mb-1.5">{tag}</div>}
        <div
          className="truncate font-mono text-[22px] font-bold text-foreground drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]"
          data-testid={EntityHeroTestId.Name}
        >
          {name}
        </div>
        {meta && <div className="mt-1.5">{meta}</div>}
        {desc && <div className="mt-1 max-w-[62ch] text-[12.5px] leading-snug text-foreground-dim drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]">{desc}</div>}
      </div>
    </div>
  );
}
```

> Verify the semantic class names against the theme (`bg-surface`, `bg-background`, `bg-accent-dim`, `text-foreground-dim`, `border-danger`/`text-danger`, `Icon` sizes `sm|xl`, glyph names `upload|edit|trash|image`). If a token/glyph name differs, use the project's actual name — grep `libs/design-system/src/tokens` and `Icon.tsx`'s `IconName` union. Keep behaviour identical.

- [ ] **Step 4: Add index + export + story**

`libs/design-system/src/components/EntityHero/index.ts`:

```ts
export { EntityHero, EntityHeroTestId } from "./EntityHero";
export type { EntityHeroProps } from "./EntityHero";
```

Add to `libs/design-system/src/index.ts` (alongside the other component exports):

```ts
export * from "./components/EntityHero";
```

`EntityHero.stories.tsx` — stories: `WithImage` (image set, editable false), `GlyphFallback` (no image), `Editable` (editable, no image), `Contain` (fit="contain"). Follow the story format of a neighbouring component (e.g. `IconTile.stories.tsx`).

- [ ] **Step 5: Run test + typecheck + lint**

Run: `pnpm exec vitest run libs/design-system/src/components/EntityHero/EntityHero.test.tsx && pnpm lint && npx tsc -p libs/design-system/tsconfig.lib.json --noEmit`
Expected: tests PASS, no lint/type errors.

- [ ] **Step 6: Commit**

```bash
git add libs/design-system/src
git commit -m "feat(ds): add EntityHero profile-avatar component"
```

---

### Task 6: Cards show the avatar (AgentCard + PipelineCard)

**Files:**
- Modify: `apps/web/features/agents/components/AgentCard.tsx:38`
- Modify: `apps/web/features/pipelines/components/PipelineCard/PipelineCard.tsx:~62`
- Test: `apps/web/features/agents/components/AgentCard.test.tsx`, `.../PipelineCard.test.tsx` (extend or create)

**Interfaces:**
- Consumes: `agent.avatar`, `p.avatar` (client `Pipeline` gains `avatar` in Task 7 — this task adds it to the card prop path; if `PipelineCard` reads a client `Pipeline`, land Task 7's `domain.ts` change first or in the same PR).

- [ ] **Step 1: Write the failing test (AgentCard)**

In `AgentCard.test.tsx`, add:

```tsx
it("renders the agent avatar over the glyph", () => {
  renderWithProviders(<AgentCard agent={{ ...baseAgent, avatar: "/avatars/architect.png" }} /* …existing props */ />);
  expect(screen.getByTestId(IconTileTestId.Image)).toHaveAttribute("src", "/avatars/architect.png");
});
```

(Use the file's existing render helper and `baseAgent` fixture; import `IconTileTestId` from `@zibby/design-system`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run apps/web/features/agents/components/AgentCard.test.tsx`
Expected: FAIL — no image rendered (glyph only).

- [ ] **Step 3: Pass `logoSrc` on AgentCard**

In `AgentCard.tsx` line 38 area, add `logoSrc={agent.avatar}` to the `<HudCard …>` props (HudCard already forwards it to `IconTile src`). Keep `glyph={(agent.glyph as IconName) ?? "bot"}` as the fallback.

- [ ] **Step 4: PipelineCard header avatar**

In `PipelineCard.tsx`, add an `IconTile` at the card header before the phase chips:

```tsx
<IconTile alt={p.name} glyph="flow" size="md" src={p.avatar} />
```

Import `IconTile` from `@zibby/design-system` if not already. Add a test asserting the image renders when `p.avatar` is set (mirror Step 1).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/web/features/agents/components/AgentCard.test.tsx apps/web/features/pipelines/components/PipelineCard/PipelineCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/agents/components/AgentCard.tsx apps/web/features/pipelines/components/PipelineCard
git commit -m "feat(web): show avatar on agent and pipeline cards"
```

---

### Task 7: Pipeline detail hero + client `Pipeline.avatar`

**Files:**
- Modify: `apps/web/domain.ts:87-97` (client `Pipeline` interface), and the contract→client mapping in the same file
- Modify: `apps/web/features/pipelines/Screen.tsx` (detail panel)
- Test: `apps/web/features/pipelines/Screen.test.tsx` (extend if present) or a focused hero test

**Interfaces:**
- Consumes: `Pipeline.avatar` (contract), `EntityHero`, `useUpdatePipelineMutation`.
- Produces: client `Pipeline.avatar?: string`.

- [ ] **Step 1: Add `avatar` to the client `Pipeline` interface + mapping**

In `apps/web/domain.ts`, add `avatar?: string;` to the `Pipeline` interface (lines 87-97) and set it wherever a contract pipeline is mapped to the client shape (search `domain.ts` for the object literal that builds `Pipeline` from the API response; add `avatar: p.avatar`).

- [ ] **Step 2: Write the failing test (detail hero)**

In the pipelines Screen test, add a case: given a selected pipeline with `avatar: "/avatars/orchestrator.png"`, the detail panel renders `EntityHeroTestId.Image` with that src. (Use the file's existing provider render + query mocks.)

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm exec vitest run apps/web/features/pipelines/Screen.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Render `EntityHero` in the detail panel**

In `Screen.tsx`, at the top of the selected-pipeline detail column, render:

```tsx
<EntityHero
  desc={sel.desc}
  editable
  fit="contain"
  glyph="flow"
  height={220}
  image={sel.avatar}
  meta={/* existing “N fází” mono text */}
  name={sel.name}
  onRemove={() => updatePipeline.mutate({ params: { id: sel.id }, body: { avatar: undefined } })}
  onUpload={(dataUri) => {
    if (dataUri.length > AVATAR_MAX) { toastBus.emit({ message: t("avatarTooLarge") }); return; }
    updatePipeline.mutate({ params: { id: sel.id }, body: { avatar: dataUri } });
  }}
  placeholder={t("uploadPipelineAvatar")}
  uploadLabel={t("uploadImage")}
  removeLabel={t("removeImage")}
/>
```

Wire `useUpdatePipelineMutation`, import `AVATAR_MAX` from `@zibby/contracts`, `toastBus` (match `ProjectBasicsPanel`'s import), and add the three i18n keys to `cs.json` + `en.json`. `onRemove` sends `avatar: undefined` — confirm `UpdatePipelineSchema` treats an omitted/undefined field as "clear"; if the storage merge keeps the old value on `undefined`, send an empty patch that removes it (follow how project logo removal is handled in `useUpdateProjectMutation`/`ProjectBasicsPanel`).

- [ ] **Step 5: Run tests + web typecheck**

Run: `pnpm exec vitest run apps/web/features/pipelines/Screen.test.tsx && npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/domain.ts apps/web/features/pipelines/Screen.tsx apps/web/i18n/messages
git commit -m "feat(web): pipeline detail avatar hero + client Pipeline.avatar"
```

---

### Task 8: Agent detail/edit hero

**Files:**
- Modify: `apps/web/features/agents/DetailScreen.tsx`
- Modify: `apps/web/features/agents/agentEditValues.ts` (form ↔ entity mapping)
- Modify: `apps/web/features/agents/agentDraft.ts`
- Modify: `apps/web/features/agents/components/NewAgentDialog.tsx` (optional avatar in create)
- Test: `apps/web/features/agents/DetailScreen.test.tsx`

**Interfaces:**
- Consumes: `Agent.avatar`, `EntityHero`, `useUpdateAgentMutation`.

- [ ] **Step 1: Thread `avatar` through the form values**

In `agentEditValues.ts`, add `avatar?: string` to the edit-values type; map it from the agent on load and back into the update payload on submit. In `agentDraft.ts`, include `avatar` in the new-agent draft (default `undefined`).

- [ ] **Step 2: Write the failing test**

In `DetailScreen.test.tsx`, add: rendering the detail for an agent with `avatar: "/avatars/architect.png"` shows `EntityHeroTestId.Image` with that src; the name overlays via `EntityHeroTestId.Name`.

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm exec vitest run apps/web/features/agents/DetailScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Render `EntityHero` at the top of DetailScreen**

Add the hero above the Basics/Rules panels, `fit="cover"`, `editable` in edit mode (bind `image` to the form's `avatar` value; `onUpload`/`onRemove` set the form field via the form controller, enforcing `AVATAR_MAX` with the same toast pattern as Task 7). The existing glyph picker in `AgentEditBasics.tsx` stays as the **fallback-icon** picker — relabel its field to make that explicit (add/keep an i18n key like `agents.fallbackIcon`). Reuse the i18n keys from Task 7 (`uploadImage`, `removeImage`) and add `agents.uploadAgentAvatar` for the placeholder.

- [ ] **Step 5: Run tests + web typecheck**

Run: `pnpm exec vitest run apps/web/features/agents/DetailScreen.test.tsx && npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/agents apps/web/i18n/messages
git commit -m "feat(web): agent detail/edit avatar hero"
```

---

### Task 9: Chat + quick-launch show the avatar

**Files:**
- Modify: `apps/web/features/chat/components/TargetIdentity.tsx:31`
- Modify: `apps/web/features/chat/components/ChatRunCard.tsx`
- Modify: `apps/web/features/overview/components/QuickLaunchPanel/QuickLaunchPanel.tsx:23` (+ the pin-resolution that builds `ResolvedPin`)
- Test: `apps/web/features/chat/components/TargetIdentity.test.tsx`

**Interfaces:**
- Consumes: `target.avatar` (Task 1/3), pin `avatar`.

- [ ] **Step 1: Write the failing test (TargetIdentity)**

```tsx
it("renders the target avatar when present", () => {
  render(<TargetIdentity target={{ kind: "agent", id: "architect", name: "Architekt", glyph: "compass", avatar: "/avatars/architect.png" }} />);
  expect(screen.getByTestId(IconTileTestId.Image)).toHaveAttribute("src", "/avatars/architect.png");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run apps/web/features/chat/components/TargetIdentity.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Pass `src` in TargetIdentity + ChatRunCard**

In `TargetIdentity.tsx` line 31, add `src={target.avatar}` to the `<IconTile … glyph={targetGlyph(target)} />`. In `ChatRunCard.tsx`, wherever it renders the target `IconTile`, add `src={target.avatar}`.

- [ ] **Step 4: Quick-launch pins carry avatar**

Add `avatar?: string` to `ResolvedPin` (line 23) and set it where pins are resolved from agents/pipelines/chains; pass `src={pin.avatar}` on the pin `IconTile`.

- [ ] **Step 5: Run tests + web typecheck**

Run: `pnpm exec vitest run apps/web/features/chat apps/web/features/overview && npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/chat apps/web/features/overview
git commit -m "feat(web): show entity avatars in chat and quick-launch"
```

---

### Task 10: Full verification + graph refresh

**Files:** none (verification).

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm typecheck && npx tsc -p apps/web/tsconfig.json --noEmit && pnpm test`
Expected: all green. Fix any failures before proceeding.

- [ ] **Step 2: Drive the running app (visual proof)**

Use the `/verify` or `/run` skill. Start the web app, then confirm by screenshot:
- `/agents` — the delivery-loop agents show avatars on their cards; an agent without one still shows its glyph.
- `/agents/architect` — the detail hero shows the avatar with the name overlaid; edit mode shows upload/remove.
- `/pipelines` and the Delivery detail — the pipeline card + detail hero show the orchestrator avatar.
- Chat — dispatch to an agent with an avatar; `TargetIdentity` shows the image.

- [ ] **Step 3: Refresh the knowledge graph**

Run: `graphify update .`

- [ ] **Step 4: Final commit (if anything changed in verification)**

```bash
git add -A && git commit -m "chore: graphify update after entity avatars" || echo "nothing to commit"
```

---

## Self-review notes

- **Spec coverage:** contract (Task 1) · API storage (Task 2) · chat data flow (Task 3) · default assets + seed (Task 4) · EntityHero DS (Task 5) · cards (Task 6) · pipeline detail (Task 7) · agent detail (Task 8) · chat + quick-launch (Task 9) · verification incl. app drive + graphify (Task 10). All spec sections mapped.
- **Ordering:** Task 7's `domain.ts` change underpins Task 6's `PipelineCard` avatar — land them in one PR (or do Task 7 step 1 before Task 6 step 4). Called out in Task 6 interfaces.
- **Type consistency:** `AvatarSchema`/`AVATAR_MAX` (contracts, Task 1) reused by API (Tasks 2-3) and web (Tasks 7-8). `EntityHeroTestId`/`EntityHeroProps` (Task 5) consumed unchanged by Tasks 6-9. `IconTileTestId.Image` is the avatar assertion selector throughout.
- **Watch-out:** verify DS token/glyph names in Task 5 Step 3 against the real theme + `IconName` union; `onRemove` clear-semantics in Task 7 Step 4 must match how project-logo removal already works.
