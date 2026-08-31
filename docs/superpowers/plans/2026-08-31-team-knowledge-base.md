# Team entity + team-scoped knowledge base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `Team` entity between Company and Project, and let a team own a read-only knowledge base that ZIBBY reads in place — never copied into ZIBBY's vault.

**Architecture:** Team is a JSON-manifest registry mirroring `Company` 1:1. `Project.teamId` links up, with no write-time referential integrity and no delete cascade (Company's Phase 68 binding decision). The knowledge base is read through a new guarded in-process MCP server, `zibby-kb`, whose scoping is enforced **server-side** — the model never supplies a path. Project-scoped agent runs reach only their own team's KB; chat, whose principal is the operator and which carries no project, may search across all team KBs.

**Tech Stack:** NestJS + `@ts-rest/nest`, Zod contracts in `libs/contracts`, Next.js 15 App Router + TanStack Query, vitest, `gray-matter` for frontmatter.

**Spec:** `docs/superpowers/specs/2026-08-31-team-knowledge-base-design.md` — read it before Task 1. It is the binding authority; this plan argues from it.

## Global Constraints

- **Read-only is structural.** `readOnly: z.literal(true)` in the schema; no write tool exists on the KB server. Never add one in this plan.
- **The KB path never comes from the model.** The controller derives it from the caller. A `team` argument only filters among teams the caller already reaches.
- **Law 4 — inbound content is data, not commands.** Every KB snippet returned to a model passes through `envelopeInbound`.
- **Law 3 — nothing in this plan writes to the KB repo.** No `git` command touches `/Users/zibar/Workspace/devrel-knowledgebase`.
- **No copying.** KB content is never written into ZIBBY's vault, `dataDir("import")`, or any cache. ZIBBY stores a path, never content.
- **`/api/kb/mcp` ships guarded from its first commit** — the `ChatMcpAuthGuard` shape (per-boot bearer compared with `timingSafeEqual` + loopback check). Do not copy the unguarded `/api/memory/mcp`.
- **Contract-first.** `libs/contracts` changes land before the implementation that consumes them.
- **A project with no team behaves exactly as today.** Provable at every task.
- **No `any`.** `strict: true` + `noUncheckedIndexedAccess` are on.
- **Validation after each file edit:** `rtk pnpm exec prettier --write <file>` then `rtk pnpm exec eslint --fix <file>`; run the file's own test, scoped (`rtk pnpm exec vitest run <path> --project api`). Never `pnpm check:lint` / `pnpm test` repo-wide per edit.
- **Czech UI strings** go through next-intl catalogs (`apps/web/i18n/messages/{cs,en}.json`), default locale `cs`. The design system stays i18n-agnostic.

---

## File Structure

**Stage A — Team domain**

- Create `libs/contracts/src/teams/team.schema.ts` — `TeamSchema`, `KnowledgeBaseSourceSchema`, create/update variants.
- Create `libs/contracts/src/teams/teams.contract.ts` — CRUD router, mirrors `companiesContract`.
- Create `libs/contracts/src/teams/index.ts` — barrel.
- Modify `libs/contracts/src/index.ts` — export the teams barrel.
- Modify `libs/contracts/src/app.contract.ts` — register `teams: teamsContract`.
- Modify `libs/contracts/src/projects/project.schema.ts` — add `teamId` to `ProjectSchema`, widen it in `UpdateProjectSchema`.
- Create `apps/api/src/teams/{teams.errors.ts, teams.storage.service.ts, teams.controller.ts, teams.module.ts}` — mirrors `apps/api/src/companies/` 1:1.
- Modify `apps/api/src/app.module.ts` — register `TeamsModule`.
- Modify `apps/api/src/projects/projects.storage.service.ts` — `teamId: null` unlink semantics.
- Modify `apps/api/src/projects/resolved-project.service.ts` + `resolved-project.helpers.ts` — the project → team → company chain.
- Create `apps/web/features/teams/` — queries, mutations, `Screen.tsx`, `DetailScreen.tsx`, panels.
- Create `apps/web/app/(dashboard)/teams/{page.tsx,[id]/page.tsx,new/page.tsx}`.
- Modify `apps/web/features/projects/components/` — a `ProjectTeamPanel.tsx` beside `ProjectCompanyPanel.tsx`.

**Stage B — KB reading**

- Modify `apps/api/src/runner/claude-run-command.service.ts` — `runId` on `ClaudeRunOptions`, threaded into `buildMcpConfig`, emitted as `X-Zibby-Run-Id`.
- Create `apps/api/src/kb/kb-reader.service.ts` — pure, filesystem-level, index-first reader over one KB root. No Nest request context, no MCP.
- Create `apps/api/src/kb/kb-scope.service.ts` — resolves a caller (runId or chat) to the set of readable KB roots.
- Create `apps/api/src/kb/kb-mcp-auth.guard.ts` — mirrors `ChatMcpAuthGuard`.
- Create `apps/api/src/kb/kb-mcp.controller.ts` — the `zibby-kb` MCP server, two tools.
- Create `apps/api/src/kb/kb.module.ts`; modify `apps/api/src/app.module.ts`.
- Modify `apps/api/src/mcp/mcp.storage.service.ts` — seed the `zibby-kb` server row beside `zibby-entities`.
- Modify `libs/contracts/src/tasks/task.schema.ts` and `libs/contracts/src/chat/chat.schema.ts` — `teamId` alongside `target`.
- Modify `apps/web/features/tasks/components/CommandLine/CommandLine.tsx` — teams as a fourth mention source.

---

## Stage A — Team domain

### Task 1: Contracts — Team schema, KB source union, Project.teamId

**Files:**

- Create: `libs/contracts/src/teams/team.schema.ts`
- Create: `libs/contracts/src/teams/teams.contract.ts`
- Create: `libs/contracts/src/teams/index.ts`
- Create: `libs/contracts/src/teams/team.schema.spec.ts`
- Modify: `libs/contracts/src/index.ts`
- Modify: `libs/contracts/src/app.contract.ts`
- Modify: `libs/contracts/src/projects/project.schema.ts`

**Interfaces:**

- Consumes: `AgentIdSchema`, `ErrorSchema`, `isValidGitRemote` (all already exported from `libs/contracts`; `isValidGitRemote` lives beside `ProjectSchema.gitRemote` in `projects/project.schema.ts` — reuse it, do not write a second validator).
- Produces: `TeamSchema`, `Team`, `TeamIdSchema`, `CreateTeamSchema`, `UpdateTeamSchema`, `KnowledgeBaseSourceSchema`, `KnowledgeBaseSource`, `teamsContract`. `ProjectSchema.teamId?: string`; `UpdateProjectSchema.teamId?: string | null`.

- [ ] **Step 1: Write the failing test**

Create `libs/contracts/src/teams/team.schema.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { KnowledgeBaseSourceSchema, TeamSchema, UpdateTeamSchema } from "./team.schema";

describe("TeamSchema", () => {
  it("accepts a minimal team", () => {
    expect(TeamSchema.parse({ id: "devrel", name: "DevRel" })).toEqual({
      id: "devrel",
      name: "DevRel",
    });
  });

  it("rejects a path-traversing id", () => {
    expect(TeamSchema.safeParse({ id: "../etc", name: "x" }).success).toBe(false);
  });

  it("accepts a vault knowledge base", () => {
    const team = TeamSchema.parse({
      id: "devrel",
      name: "DevRel",
      companyId: "shoptet",
      knowledgeBase: {
        kind: "vault",
        path: "/Users/zibar/Workspace/devrel-knowledgebase",
        gitRemote: "git@github.com:shoptet/devrel-knowledgebase.git",
        readOnly: true,
      },
    });
    expect(team.knowledgeBase?.kind).toBe("vault");
  });

  it("refuses to make a knowledge base writable", () => {
    const result = KnowledgeBaseSourceSchema.safeParse({
      kind: "vault",
      path: "/tmp/kb",
      readOnly: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys on a vault source", () => {
    const result = KnowledgeBaseSourceSchema.safeParse({
      kind: "vault",
      path: "/tmp/kb",
      readOnly: true,
      writeToken: "nope",
    });
    expect(result.success).toBe(false);
  });

  it("omits id from the update schema", () => {
    expect(UpdateTeamSchema.safeParse({ id: "other" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm exec vitest run libs/contracts/src/teams/team.schema.spec.ts --project contracts`

Expected: FAIL — cannot resolve `./team.schema`.

If the `--project contracts` name is wrong, read `vitest.workspace.ts` (or the root `vitest.config.ts`) and use the project name defined there for `libs/contracts`. Use that same name for every contracts test in this plan.

- [ ] **Step 3: Write `team.schema.ts`**

```ts
import { z } from "zod";
import { AgentIdSchema } from "../agents/agent.schema";
import { isValidGitRemote } from "../projects/project.schema";

/** Filename-safe id — same constraint as agents/companies, no path traversal. */
export const TeamIdSchema = AgentIdSchema;

/**
 * Where a team's knowledge base lives.
 *
 * A discriminated union from day one even though v1 has a single member: a
 * company-level knowledge base is expected later and will NOT be a git folder —
 * it will live in Confluence or a similar wiki. Adding `kind: "confluence"`
 * must not disturb `kind: "vault"`.
 *
 * `readOnly` is a literal `true`, not a boolean: read-only is structural (Law 1),
 * not a setting an operator can weaken. Nothing in the system can write to a
 * knowledge base, because no write tool exists.
 */
export const KnowledgeBaseSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("vault"),
      /** Absolute host path, read in place. Never copied into ZIBBY's vault. */
      path: z.string().min(1),
      gitRemote: z
        .string()
        .min(1)
        .refine(isValidGitRemote, { message: "unsupported git remote" })
        .optional(),
      readOnly: z.literal(true),
    })
    .strict(),
]);
export type KnowledgeBaseSource = z.infer<typeof KnowledgeBaseSourceSchema>;

/**
 * A team inside a company — the layer that owns a knowledge base.
 *
 * `companyId` is a bare optional string, deliberately NOT an FK-validated
 * reference: it mirrors `Project.companyId`, where a dangling id is tolerated
 * and resolved to "no company" at read time (Phase 68 binding decision).
 * Many teams per company; at most one company per team.
 */
export const TeamSchema = z.object({
  id: TeamIdSchema,
  name: z.string().min(1),
  companyId: z.string().optional(),
  desc: z.string().optional(),
  knowledgeBase: KnowledgeBaseSourceSchema.optional(),
});
export type Team = z.infer<typeof TeamSchema>;

export const CreateTeamSchema = TeamSchema;
export type CreateTeamInput = z.infer<typeof CreateTeamSchema>;

export const UpdateTeamSchema = TeamSchema.omit({ id: true }).partial();
export type UpdateTeamInput = z.infer<typeof UpdateTeamSchema>;
```

If `AgentIdSchema` or `isValidGitRemote` is not exported from those exact paths, locate them with `rtk grep -n "isValidGitRemote\|export const AgentIdSchema" libs/contracts/src` and import from where they actually live. Do not duplicate either.

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk pnpm exec vitest run libs/contracts/src/teams/team.schema.spec.ts --project contracts`

Expected: PASS, 6/6.

- [ ] **Step 5: Write `teams.contract.ts`**

Copy `libs/contracts/src/companies/companies.contract.ts` verbatim and substitute Team for Company throughout. Keep the route ORDER identical — `searchTeams` (`GET /teams/search`) must be declared **before** `getTeam` (`GET /teams/:id`) or it will be captured by the `:id` param. Keep `{ pathPrefix: "/api", strictStatusCodes: true }`. The delete summary must record the no-cascade decision:

```ts
    deleteTeam: {
      method: "DELETE",
      path: "/teams/:id",
      pathParams: z.object({ id: TeamIdSchema }),
      responses: { 200: z.object({ id: TeamIdSchema }), 404: ErrorSchema },
      summary: "Delete a team (allowed even with linked projects — they keep a dangling teamId)",
    },
```

- [ ] **Step 6: Barrel + registration**

`libs/contracts/src/teams/index.ts`:

```ts
export * from "./team.schema";
export * from "./teams.contract";
```

Add `export * from "./teams";` to `libs/contracts/src/index.ts` beside the companies export, and register the router in `libs/contracts/src/app.contract.ts` beside `companies: companiesContract`:

```ts
  teams: teamsContract,
```

- [ ] **Step 7: Add `teamId` to Project**

In `libs/contracts/src/projects/project.schema.ts`, add to `ProjectSchema` immediately after `companyId`:

```ts
  /**
   * Owning team (Firma → Tým → Projekt). Bare optional string, not an FK —
   * mirrors `companyId`: deleting a team leaves a dangling id that resolves to
   * "no team" at read time. At most one team per project.
   */
  teamId: z.string().optional(),
```

and in `UpdateProjectSchema`, beside the existing `companyId` widening:

```ts
  teamId: z.string().optional().nullable(),
```

- [ ] **Step 8: Typecheck the whole contracts surface**

Run: `rtk pnpm exec tsc --noEmit -p libs/contracts/tsconfig.lib.json`

Expected: clean. Widening a shared schema ripples — if `apps/api` or `apps/web` now fails to compile, that is in scope for this task; fix it here.

Also run: `rtk pnpm exec tsc --noEmit -p apps/api/tsconfig.app.json` and the equivalent for `apps/web`. If those config paths do not exist, find them with `rtk find "tsconfig*.json"`.

- [ ] **Step 9: Format, lint, commit**

```bash
rtk pnpm exec prettier --write libs/contracts/src/teams libs/contracts/src/index.ts libs/contracts/src/app.contract.ts libs/contracts/src/projects/project.schema.ts
rtk pnpm exec eslint --fix libs/contracts/src/teams libs/contracts/src/projects/project.schema.ts
rtk git add libs/contracts
rtk git commit -m "feat(contracts): Team entity, knowledge-base source union, Project.teamId"
```

---

### Task 2: Teams API module

**Files:**

- Create: `apps/api/src/teams/teams.errors.ts`
- Create: `apps/api/src/teams/teams.storage.service.ts`
- Create: `apps/api/src/teams/teams.controller.ts`
- Create: `apps/api/src/teams/teams.module.ts`
- Create: `apps/api/src/teams/teams.storage.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

- Consumes: `TeamSchema`, `CreateTeamInput`, `UpdateTeamInput`, `teamsContract` from Task 1. `ensureDir`, `safeJson`, `searchByText`, `writeFileAtomic` from `../shared/file-storage`. `dataDir` from `../shared/data-dir`.
- Produces: `TeamsStorageService` with `list()`, `get(id)`, `search(q)`, `create(input)`, `update(id, patch)`, `delete(id)`; the DI token `TEAMS_DIR`; `resolveTeamsDir()`. Task 3 injects `TeamsStorageService`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/teams/teams.storage.service.spec.ts`. Mirror the companies storage spec — locate it first with `rtk find "companies.storage.service.spec.ts"` and follow its temp-dir setup convention exactly (it will use a per-test temp dir; reuse that helper rather than inventing one).

```ts
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamNotFoundError } from "./teams.errors";
import { TeamsStorageService } from "./teams.storage.service";

describe("TeamsStorageService", () => {
  let dir: string;
  let store: TeamsStorageService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "zibby-teams-"));
    store = new TeamsStorageService(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("starts empty", async () => {
    expect(await store.list()).toEqual([]);
  });

  it("creates and reads back a team with a knowledge base", async () => {
    await store.create({
      id: "devrel",
      name: "DevRel",
      companyId: "shoptet",
      knowledgeBase: { kind: "vault", path: "/tmp/kb", readOnly: true },
    });
    const team = await store.get("devrel");
    expect(team.knowledgeBase).toEqual({ kind: "vault", path: "/tmp/kb", readOnly: true });
  });

  it("keeps the list sorted by id", async () => {
    await store.create({ id: "zeta", name: "Zeta" });
    await store.create({ id: "alpha", name: "Alpha" });
    expect((await store.list()).map((t) => t.id)).toEqual(["alpha", "zeta"]);
  });

  it("drops corrupt rows instead of failing the listing", async () => {
    await store.create({ id: "devrel", name: "DevRel" });
    const file = path.join(dir, "_teams.json");
    const rows = JSON.parse(await fs.readFile(file, "utf8")) as unknown[];
    await fs.writeFile(file, JSON.stringify([...rows, { id: "", name: "" }], null, 2));
    expect((await store.list()).map((t) => t.id)).toEqual(["devrel"]);
  });

  it("throws TeamNotFoundError for an unknown id", async () => {
    await expect(store.get("nope")).rejects.toBeInstanceOf(TeamNotFoundError);
  });

  it("deletes without touching anything else", async () => {
    await store.create({ id: "devrel", name: "DevRel" });
    await store.delete("devrel");
    expect(await store.list()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm exec vitest run apps/api/src/teams/teams.storage.service.spec.ts --project api`

Expected: FAIL — cannot resolve `./teams.storage.service`.

- [ ] **Step 3: Write the errors file**

`apps/api/src/teams/teams.errors.ts`:

```ts
/** Raised when a team does not exist for the requested id. */
export class TeamNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Team "${id}" not found`);
    this.name = "TeamNotFoundError";
  }
}

/** Raised when creating a team whose id is already taken. */
export class TeamConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Team "${id}" already exists`);
    this.name = "TeamConflictError";
  }
}
```

- [ ] **Step 4: Write the storage service**

`apps/api/src/teams/teams.storage.service.ts` — copy `apps/api/src/companies/companies.storage.service.ts` and substitute Team for Company. Drop the `backfillCompanyPersonIds` mapping entirely (Team has no `people` roster in v1). Manifest file is `_teams.json`.

```ts
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import {
  type CreateTeamInput,
  type Team,
  TeamSchema,
  type UpdateTeamInput,
} from "@zibby/contracts";
import { ensureDir, safeJson, searchByText, writeFileAtomic } from "../shared/file-storage";
import { TeamConflictError, TeamNotFoundError } from "./teams.errors";

/** DI token carrying the absolute path of the directory that holds the registry. */
export const TEAMS_DIR = "TEAMS_DIR";

/** Manifest file holding the team registry. */
const MANIFEST_FILE = "_teams.json";

/**
 * File-backed persistence for the team registry — a single JSON manifest
 * (`_teams.json`), mirroring `CompaniesStorageService` verbatim. Deleting a team
 * that still has projects pointing at it via `teamId` is allowed (no cascade);
 * the dangling reference resolves to "no team" at read time.
 */
@Injectable()
export class TeamsStorageService {
  private readonly dir: string;
  private readonly file: string;

  constructor(@Inject(TEAMS_DIR) dir: string) {
    this.dir = path.resolve(dir);
    this.file = path.join(this.dir, MANIFEST_FILE);
  }

  async list(): Promise<Team[]> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return [];
    const parsed = safeJson(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .flatMap((entry) => {
        const result = TeamSchema.safeParse(entry);
        return result.success ? [result.data] : [];
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<Team> {
    const team = (await this.list()).find((t) => t.id === id);
    if (!team) throw new TeamNotFoundError(id);
    return team;
  }

  /** Free-text search over the registry by id, name and desc. */
  async search(query: string): Promise<Team[]> {
    return searchByText(await this.list(), query, (t) => [t.id, t.name, t.desc]);
  }

  async create(input: CreateTeamInput): Promise<Team> {
    const teams = await this.list();
    if (teams.some((t) => t.id === input.id)) throw new TeamConflictError(input.id);
    const team = TeamSchema.parse(input);
    await this.writeAtomic([...teams, team]);
    return team;
  }

  async update(id: string, patch: UpdateTeamInput): Promise<Team> {
    const teams = await this.list();
    const existing = teams.find((t) => t.id === id);
    if (!existing) throw new TeamNotFoundError(id);
    const merged = TeamSchema.parse({ ...existing, ...patch, id: existing.id });
    await this.writeAtomic(teams.map((t) => (t.id === id ? merged : t)));
    return merged;
  }

  async delete(id: string): Promise<void> {
    const teams = await this.list();
    if (!teams.some((t) => t.id === id)) throw new TeamNotFoundError(id);
    await this.writeAtomic(teams.filter((t) => t.id !== id));
  }

  /** Write via a temp file + atomic rename so a crash can't leave a torn manifest. */
  private async writeAtomic(teams: Team[]): Promise<void> {
    await ensureDir(this.dir);
    await writeFileAtomic(this.file, `${JSON.stringify(teams, null, 2)}\n`);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `rtk pnpm exec vitest run apps/api/src/teams/teams.storage.service.spec.ts --project api`

Expected: PASS, 6/6.

- [ ] **Step 6: Controller and module**

`apps/api/src/teams/teams.controller.ts` — copy `apps/api/src/companies/companies.controller.ts` verbatim, substituting Team for Company and `teamsContract` for `companiesContract`. It maps `TeamNotFoundError` → 404 and `TeamConflictError` → 409 through the same shared `makeErrorMapper` the companies controller uses.

`apps/api/src/teams/teams.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { TeamsController } from "./teams.controller";
import { TEAMS_DIR, TeamsStorageService } from "./teams.storage.service";

/** Default registry directory when `TEAMS_DIR` is not set. */
export function resolveTeamsDir(): string {
  return process.env.TEAMS_DIR ?? dataDir("teams");
}

@Module({
  controllers: [TeamsController],
  providers: [{ provide: TEAMS_DIR, useFactory: resolveTeamsDir }, TeamsStorageService],
  exports: [TeamsStorageService],
})
export class TeamsModule {}
```

Register `TeamsModule` in `apps/api/src/app.module.ts` beside `CompaniesModule`.

- [ ] **Step 7: e2e**

Find the companies e2e spec (`rtk find "companies*e2e*"`) and mirror it for teams, covering: create → 201; create duplicate id → 409; list; `GET /api/teams/search?q=` matching by name; get unknown → 404; patch; delete → 200; **delete a team that a project links to, then confirm `GET /api/projects/:id` still returns the project with its now-dangling `teamId`** (the no-cascade decision).

Run it scoped, paste real output.

- [ ] **Step 8: Format, lint, commit**

```bash
rtk pnpm exec prettier --write apps/api/src/teams apps/api/src/app.module.ts
rtk pnpm exec eslint --fix apps/api/src/teams apps/api/src/app.module.ts
rtk git add apps/api/src/teams apps/api/src/app.module.ts
rtk git commit -m "feat(api): teams registry module (CRUD, manifest store, no-cascade delete)"
```

---

### Task 3: Resolution chain — project → team → company

**Files:**

- Modify: `apps/api/src/projects/resolved-project.service.ts`
- Modify: `apps/api/src/projects/resolved-project.helpers.ts`
- Modify: `apps/api/src/projects/projects.storage.service.ts`
- Modify: `apps/api/src/projects/resolved-project.helpers.spec.ts` (create if absent)
- Modify: `apps/api/src/projects/projects.module.ts` (import `TeamsModule`)

**Interfaces:**

- Consumes: `TeamsStorageService` (Task 2), `Team`, `KnowledgeBaseSource` (Task 1).
- Produces: `resolveKnowledgeBase(project, team): KnowledgeBaseSource | null` (pure) and, on `ResolvedProjectService`, `knowledgeBaseFor(projectId: string): Promise<KnowledgeBaseSource | null>`. Task 7's `KbScopeService` calls `knowledgeBaseFor`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/projects/resolved-project.helpers.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveEffectiveCompanyId, resolveKnowledgeBase } from "./resolved-project.helpers";

const kb = { kind: "vault", path: "/tmp/kb", readOnly: true } as const;

describe("resolveKnowledgeBase", () => {
  it("returns null when the project has no team", () => {
    expect(resolveKnowledgeBase({ id: "p", name: "P" }, null)).toBeNull();
  });

  it("returns null when the team has no knowledge base", () => {
    expect(
      resolveKnowledgeBase({ id: "p", name: "P" }, { id: "devrel", name: "DevRel" }),
    ).toBeNull();
  });

  it("returns the team's knowledge base", () => {
    expect(
      resolveKnowledgeBase(
        { id: "p", name: "P" },
        { id: "devrel", name: "DevRel", knowledgeBase: kb },
      ),
    ).toEqual(kb);
  });
});

describe("resolveEffectiveCompanyId", () => {
  it("prefers an explicit project link over the team's company", () => {
    expect(
      resolveEffectiveCompanyId(
        { id: "p", name: "P", companyId: "acme" },
        {
          id: "devrel",
          name: "DevRel",
          companyId: "shoptet",
        },
      ),
    ).toBe("acme");
  });

  it("falls back to the team's company", () => {
    expect(
      resolveEffectiveCompanyId(
        { id: "p", name: "P" },
        {
          id: "devrel",
          name: "DevRel",
          companyId: "shoptet",
        },
      ),
    ).toBe("shoptet");
  });

  it("returns undefined when neither has one", () => {
    expect(resolveEffectiveCompanyId({ id: "p", name: "P" }, null)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm exec vitest run apps/api/src/projects/resolved-project.helpers.spec.ts --project api`

Expected: FAIL — `resolveKnowledgeBase` is not exported.

- [ ] **Step 3: Add the pure helpers**

In `apps/api/src/projects/resolved-project.helpers.ts`:

```ts
/**
 * Effective company for a project: an explicit project link stays authoritative;
 * otherwise it is inherited from the project's team (Firma → Tým → Projekt).
 */
export function resolveEffectiveCompanyId(
  project: Pick<Project, "companyId">,
  team: Pick<Team, "companyId"> | null,
): string | undefined {
  return project.companyId ?? team?.companyId;
}

/**
 * Effective knowledge base for a project. v1: the owning team's, or none.
 * The signature takes the resolved team rather than an id so a project-level or
 * company-level owner can be added later without changing call sites.
 */
export function resolveKnowledgeBase(
  project: Pick<Project, "id">,
  team: Pick<Team, "knowledgeBase"> | null,
): KnowledgeBaseSource | null {
  return team?.knowledgeBase ?? null;
}
```

Import the types from `@zibby/contracts`. `project` is intentionally unused in `resolveKnowledgeBase` today — keep the parameter (it is the seam for a future project-level KB) and satisfy the linter the way this codebase already does elsewhere; if ESLint rejects an unused parameter, prefix it `_project` rather than deleting it.

- [ ] **Step 4: Wire the service**

In `apps/api/src/projects/resolved-project.service.ts`, mirror the existing `findCompany` tolerance exactly:

```ts
  private async findTeam(teamId: string | undefined): Promise<Team | null> {
    if (!teamId) return null;
    return this.teams.get(teamId).catch(() => null);
  }

  /** The knowledge base a run on this project may read. Null when there is none. */
  async knowledgeBaseFor(projectId: string): Promise<KnowledgeBaseSource | null> {
    const project = await this.projects.get(projectId).catch(() => null);
    if (!project) return null;
    return resolveKnowledgeBase(project, await this.findTeam(project.teamId));
  }
```

Inject `TeamsStorageService` in the constructor, and import `TeamsModule` in `apps/api/src/projects/projects.module.ts`. Where the service already computes the resolved company, route it through `resolveEffectiveCompanyId` so a team-inherited company reaches the existing integration merge unchanged.

- [ ] **Step 5: `teamId: null` unlink semantics**

In `apps/api/src/projects/projects.storage.service.ts`, beside the existing `hasCompanyId` block (~:106-125), add the identical treatment for `teamId`:

```ts
// `teamId: null` is the explicit "unlink the team" signal — distinct from an
// ABSENT `teamId` key, which leaves the current link alone.
const hasTeamId = "teamId" in patch;
```

and in the merged object: `...(hasTeamId ? { teamId: teamId === null ? undefined : teamId } : {})`.

Add a storage spec case: patching `{ teamId: null }` clears it; patching `{ name: "x" }` leaves it intact.

- [ ] **Step 6: Run tests to verify they pass**

Run: `rtk pnpm exec vitest run apps/api/src/projects --project api`

Expected: PASS, including the pre-existing projects/resolved-project suites — a project with no team must be unchanged.

- [ ] **Step 7: Format, lint, commit**

```bash
rtk pnpm exec prettier --write apps/api/src/projects
rtk pnpm exec eslint --fix apps/api/src/projects
rtk git add apps/api/src/projects
rtk git commit -m "feat(api): resolve project -> team -> company, expose the team knowledge base"
```

---

### Task 4: Teams web feature and project wiring

**Files:**

- Create: `apps/web/features/teams/queries/{useTeamsQuery.ts,useTeamQuery.ts,index.ts}`
- Create: `apps/web/features/teams/mutations/{useCreateTeamMutation.ts,useUpdateTeamMutation.ts,useDeleteTeamMutation.ts,index.ts}`
- Create: `apps/web/features/teams/{Screen.tsx,DetailScreen.tsx}`
- Create: `apps/web/features/teams/components/{TeamCard.tsx,TeamBasicsPanel.tsx,TeamKnowledgeBasePanel.tsx,LinkProjectDialog.tsx}`
- Create: `apps/web/app/(dashboard)/teams/{page.tsx,[id]/page.tsx,new/page.tsx}`
- Create: `apps/web/features/projects/components/ProjectTeamPanel.tsx`
- Modify: `apps/web/features/projects/ProfileScreen.tsx` (mount the panel)
- Modify: `apps/web/i18n/messages/{cs,en}.json`
- Create: component tests mirroring `apps/web/features/companies/**/*.spec.tsx`

**Interfaces:**

- Consumes: `teamsContract` (Task 1), `useUpdateProjectMutation` (existing).
- Produces: `useTeamsQuery()` / `getTeamsQueryKey()` — Task 8's mention picker consumes `useTeamsQuery`.

- [ ] **Step 1: Mirror the companies feature**

Read `apps/web/features/companies/` in full and mirror it file-for-file. Hooks follow the project convention: one hook per file, `select: selectApiResponseBody`, each query file exports `getXxxQueryKey()`, mutations return the `useMutation` result directly and keep invalidation in the hook via `makeInvalidatingMutation`.

`Screen.tsx` = grid of `TeamCard` + empty state + "add team". `DetailScreen.tsx` = `TeamBasicsPanel` (name/desc/company select) + `TeamKnowledgeBasePanel` + member projects as a **reverse lookup** (`projectsQ.data.filter((p) => p.teamId === id)`) with `LinkProjectDialog`.

- [ ] **Step 2: The knowledge-base panel**

`TeamKnowledgeBasePanel.tsx` edits `knowledgeBase` and must:

- offer only `kind: "vault"` (the union has one member today);
- send `readOnly: true` always — never render a toggle for it. Read-only is structural, and a UI switch would imply otherwise;
- show the path as text with a hint that it is read in place and never copied;
- allow clearing the KB by sending `knowledgeBase: undefined`.

Compose from design-system primitives only. No inline `style={{…}}` on DOM elements in `apps/web` (ESLint forbids it).

- [ ] **Step 3: Project detail wiring**

`ProjectTeamPanel.tsx` mirrors `ProjectCompanyPanel.tsx` — a `SelectField` over `useTeamsQuery()`, sending the unlink signal explicitly:

```tsx
updateProject.mutate({
  params: { id: projectId },
  body: { teamId: value === NO_TEAM ? null : value },
});
```

Mount it beside the company panel in `ProfileScreen.tsx`.

- [ ] **Step 4: Nav + i18n**

Add the `teams` segment to the dashboard nav the same way `companies` is registered, and add every new string to both `cs.json` and `en.json` (default locale is `cs`).

- [ ] **Step 5: Tests**

Mirror the companies component tests. At minimum: the list renders teams and the empty state; the detail screen lists member projects by reverse lookup; the KB panel never renders a writable toggle; the project team panel sends `teamId: null` when cleared.

Run: `rtk pnpm exec vitest run apps/web/features/teams apps/web/features/projects --project web-components`

Expected: PASS.

- [ ] **Step 6: Format, lint, commit**

```bash
rtk pnpm exec prettier --write apps/web/features/teams apps/web/app/\(dashboard\)/teams apps/web/features/projects apps/web/i18n/messages
rtk pnpm exec eslint --fix apps/web/features/teams apps/web/features/projects
rtk git add apps/web
rtk git commit -m "feat(web): teams list/detail, knowledge-base panel, project team selector"
```

---

## Stage B — Reading the knowledge base

### Task 5: Run identity reaches the in-process MCP controllers

**Files:**

- Modify: `apps/api/src/runner/claude-run-command.service.ts`
- Modify: `apps/api/src/agents/agent-runner.service.ts`
- Modify: `apps/api/src/pipelines/pipeline-runner.service.ts`
- Modify: `apps/api/src/runner/claude-run-command.service.spec.ts` (create if absent)

**Interfaces:**

- Produces: `ClaudeRunOptions.runId?: string`; the header `X-Zibby-Run-Id` on ZIBBY's own in-process http MCP entries. Task 7 reads that header.

**Context:** verified 2026-08-31 — no run identity reaches these controllers today. `buildMcpConfig` (`:632-660`) builds every field from the static `McpServer` row plus a credentials lookup keyed by `server.id`. The pattern to copy is `ChatMcpController` + `ChatSessionService` (`:167-170`), which does the same thing per chat turn with a `conversationId` query param.

- [ ] **Step 1: Write the failing test**

Assert on the built command, not on a live run:

```ts
it("carries the run id as a header on ZIBBY's own in-process MCP servers", async () => {
  const config = await service.buildMcpConfigForTest(
    [{ id: "zibby-kb", type: "http", url: "http://localhost:3333/api/kb/mcp", enabled: true }],
    "run-123",
  );
  expect(config?.mcpServers["zibby-kb"]?.headers).toMatchObject({ "X-Zibby-Run-Id": "run-123" });
});

it("does not leak the run id to third-party MCP servers", async () => {
  const config = await service.buildMcpConfigForTest(
    [{ id: "context7", type: "http", url: "https://example.invalid/mcp", enabled: true }],
    "run-123",
  );
  expect(config?.mcpServers["context7"]?.headers ?? {}).not.toHaveProperty("X-Zibby-Run-Id");
});
```

The second case is load-bearing: the run id is an internal capability token and must not be sent to hosts ZIBBY does not control. Decide the in-process test by URL host (loopback) or by an explicit id allow-list — pick one, and state which in a code comment.

If `buildMcpConfig` is private, expose a narrowly-named test seam rather than widening the public API, following whatever convention the file already uses for its other unit tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm exec vitest run apps/api/src/runner/claude-run-command.service.spec.ts --project api`

Expected: FAIL.

- [ ] **Step 3: Thread `runId`**

1. Add `runId?: string;` to `ClaudeRunOptions` (~:18-77) with a doc comment: _"The run this command belongs to. Carried to ZIBBY's own in-process MCP servers as `X-Zibby-Run-Id` so they can scope what the run may read. Never sent to third-party servers."_
2. Thread it from `buildClaudeCommand` (~:419) into the `buildMcpConfig(...)` call (~:449).
3. In `buildMcpConfig`'s http/sse branch (~:652-657), add the header only for in-process servers.

- [ ] **Step 4: Pass the real run id from both runners**

`AgentRunnerService` and `PipelineRunnerService` already know their run id where they build the command — pass it. Do not invent a new id.

- [ ] **Step 5: Run tests to verify they pass**

Run: `rtk pnpm exec vitest run apps/api/src/runner apps/api/src/agents apps/api/src/pipelines --project api`

Expected: PASS, no regressions.

- [ ] **Step 6: Format, lint, commit**

```bash
rtk pnpm exec prettier --write apps/api/src/runner apps/api/src/agents apps/api/src/pipelines
rtk pnpm exec eslint --fix apps/api/src/runner apps/api/src/agents apps/api/src/pipelines
rtk git add apps/api/src
rtk git commit -m "feat(runner): carry the run id to ZIBBY's in-process MCP servers"
```

---

### Task 6: The knowledge-base reader

**Files:**

- Create: `apps/api/src/kb/kb-reader.service.ts`
- Create: `apps/api/src/kb/kb-reader.service.spec.ts`

**Interfaces:**

- Consumes: `gray-matter` (already a dependency, used by `VaultService`); `KnowledgeBaseSource` (Task 1).
- Produces:

  ```ts
  export interface KbHit {
    readonly noteId: string;
    readonly title: string;
    readonly path: string;
    readonly snippet: string;
  }
  class KbReaderService {
    search(source: KnowledgeBaseSource, query: string, limit?: number): Promise<KbHit[]>;
    read(
      source: KnowledgeBaseSource,
      noteId: string,
    ): Promise<{ path: string; title: string; body: string } | null>;
  }
  ```

  `path` on every result is **repo-relative** to the KB root — never an absolute host path. Task 7 consumes both methods.

- [ ] **Step 1: Write the failing test**

Build a fixture KB in a temp dir shaped like the real one — `team-context.md`, `wiki/INDEX.md`, `wiki/notes/<slug>.md` with frontmatter, and a `meetings/x.vtt`.

```ts
describe("KbReaderService", () => {
  it("finds a note by title and returns a repo-relative path", async () => {
    const hits = await reader.search(source, "partner portal");
    expect(hits[0]?.path).toBe("wiki/notes/partner-portal.md");
    expect(path.isAbsolute(hits[0]?.path ?? "")).toBe(false);
  });

  it("returns nothing for a query that matches nothing", async () => {
    expect(await reader.search(source, "zzzz-nothing")).toEqual([]);
  });

  it("refuses to escape the knowledge-base root", async () => {
    expect(await reader.read(source, "../../../etc/passwd")).toBeNull();
    expect(await reader.read(source, "..%2f..%2fetc%2fpasswd")).toBeNull();
  });

  it("does not follow a symlink pointing outside the root", async () => {
    await fs.symlink(outsideFile, path.join(root, "wiki/notes/escape.md"));
    expect(await reader.read(source, "escape")).toBeNull();
  });

  it("ignores dot-directories", async () => {
    await fs.mkdir(path.join(root, ".git"), { recursive: true });
    await fs.writeFile(path.join(root, ".git/secret.md"), "# secret\ntoken");
    expect(await reader.search(source, "secret")).toEqual([]);
  });

  it("returns an empty result for a missing root instead of throwing", async () => {
    expect(
      await reader.search({ kind: "vault", path: "/nope/missing", readOnly: true }, "x"),
    ).toEqual([]);
  });

  it("caps a note body so one huge note cannot flood a prompt", async () => {
    const note = await reader.read(source, "huge");
    expect(note?.body.length).toBeLessThanOrEqual(4000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm exec vitest run apps/api/src/kb/kb-reader.service.spec.ts --project api`

Expected: FAIL.

- [ ] **Step 3: Implement the reader**

Requirements, all enforced in this file:

- **Index-first.** Walk order: `team-context.md`, then `wiki/INDEX.md`, then the notes it links to, then the remaining `.md` under `wiki/`. Ranking: a term in the title or an `aliases`/`tags` frontmatter field outranks a term in the body — mirror `VaultService.selectIndexes`'s scoring shape rather than inventing a new one.
- **Path guard.** Every resolved file must satisfy containment against the KB root after `path.resolve` — the shape of `resolveSafeFile` (`apps/api/src/shared/file-storage/file-utils.ts:56-66`). Use `fs.lstat` and refuse symlinks. Skip dot-directories while walking, exactly as `VaultService.walk()` does.
- **Never writes.** No `fs.writeFile`, `mkdir`, or `rename` in this file, ever.
- **Fail soft.** A missing or unreadable root yields `[]` / `null`, never a throw — a misconfigured team KB must not break a run.
- **Budgets.** Snippet ≤ 500 chars; a note body from `read` ≤ 4000 chars, truncated with a visible marker. Extract both as named constants.
- **Frontmatter** via `gray-matter`, like `VaultService`.
- `.vtt` files are indexed by filename only, not parsed — they are raw sources, and their bodies are long verbatim transcripts.

Do **not** call `envelopeInbound` here. This service returns structured data; enveloping is the MCP boundary's job (Task 7), and double-enveloping would corrupt the markers.

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk pnpm exec vitest run apps/api/src/kb/kb-reader.service.spec.ts --project api`

Expected: PASS, 7/7.

- [ ] **Step 5: Format, lint, commit**

```bash
rtk pnpm exec prettier --write apps/api/src/kb
rtk pnpm exec eslint --fix apps/api/src/kb
rtk git add apps/api/src/kb
rtk git commit -m "feat(api): index-first read-only knowledge-base reader with path guard"
```

---

### Task 7: The `zibby-kb` MCP server — guarded, server-side scoped

**Files:**

- Create: `apps/api/src/kb/kb-scope.service.ts`
- Create: `apps/api/src/kb/kb-scope.service.spec.ts`
- Create: `apps/api/src/kb/kb-mcp-auth.guard.ts`
- Create: `apps/api/src/kb/kb-mcp.controller.ts`
- Create: `apps/api/src/kb/kb.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/mcp/mcp.storage.service.ts`

**Interfaces:**

- Consumes: `KbReaderService` (Task 6), `ResolvedProjectService.knowledgeBaseFor` (Task 3), `TeamsStorageService` (Task 2), the `X-Zibby-Run-Id` header (Task 5), `envelopeInbound` (existing), the run→project lookup the runs store already provides.
- Produces: MCP tools `search_team_kb({ query, team? })` and `read_team_kb_note({ noteId, team? })` at `POST /api/kb/mcp`, and the scope type both the service and the controller speak:

  ```ts
  /** One knowledge base a caller is allowed to read, with the team it belongs to. */
  export interface KbRoot {
    readonly teamId: string;
    readonly teamName: string;
    readonly source: KnowledgeBaseSource;
  }

  class KbScopeService {
    rootsForRun(runId: string | undefined, team?: string): Promise<KbRoot[]>;
    rootsForChat(team?: string): Promise<KbRoot[]>;
  }
  ```

- [ ] **Step 1: Write the failing scope test**

`KbScopeService` is where the whole security story lives, so it is tested as a pure unit:

```ts
describe("KbScopeService", () => {
  it("gives a project-scoped run only its own team's KB", async () => {
    const roots = await scope.rootsForRun("run-devrel");
    expect(roots.map((r) => r.teamId)).toEqual(["devrel"]);
  });

  it("gives a run on a project with no team nothing", async () => {
    expect(await scope.rootsForRun("run-teamless")).toEqual([]);
  });

  it("gives a run whose team has no KB nothing", async () => {
    expect(await scope.rootsForRun("run-kbless")).toEqual([]);
  });

  it("gives an unknown run id nothing", async () => {
    expect(await scope.rootsForRun("run-does-not-exist")).toEqual([]);
  });

  it("gives a chat caller every team KB when no team is named", async () => {
    expect((await scope.rootsForChat(undefined)).map((r) => r.teamId).sort()).toEqual([
      "devrel",
      "platform",
    ]);
  });

  it("narrows a chat caller to the named team", async () => {
    expect((await scope.rootsForChat("devrel")).map((r) => r.teamId)).toEqual(["devrel"]);
  });

  it("ignores a team argument a run may not reach", async () => {
    expect((await scope.rootsForRun("run-devrel", "platform")).map((r) => r.teamId)).toEqual([]);
  });
});
```

The last case is the one that matters most: `team` narrows, it never widens.

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm exec vitest run apps/api/src/kb/kb-scope.service.spec.ts --project api`

Expected: FAIL.

- [ ] **Step 3: Implement `KbScopeService`**

```
rootsForRun(runId, team?)  → run → projectId → knowledgeBaseFor(projectId) → [root] (∩ team if given)
rootsForChat(team?)        → every team with a knowledgeBase (∩ team if given)
```

Document the asymmetry in the file's doc comment, quoting the spec's reasoning: _a project-scoped run is autonomous and gets only its own team's KB; a chat turn's principal is the operator and carries no project, so with no explicit team it may search across all team KBs._ Without that, an untagged chat turn resolves to nothing and the inferred branch dies.

An unknown/absent run id yields `[]` — fail closed.

- [ ] **Step 4: The guard**

`kb-mcp-auth.guard.ts` mirrors `apps/api/src/chat/chat-mcp-auth.guard.ts`: per-boot bearer token compared with `timingSafeEqual`, plus the loopback check on `req.socket.remoteAddress`. Read that file first and copy its structure — including the timing-safe comparison and its handling of length mismatch. Do not weaken either check. Do **not** copy `/api/memory/mcp`, which has no guard at all (a pre-existing gap recorded in the spec's §10).

The token must reach the runner the same way the chat token does, so `buildMcpConfig` emits it in `headers` for the seeded `zibby-kb` row.

- [ ] **Step 5: The controller**

`kb-mcp.controller.ts` mirrors `ChatMcpController`'s shape: `handle()` reads the caller identity off the request — `X-Zibby-Run-Id` when present, otherwise the chat path — and calls `buildServer(caller)`. Two tools, both read-only:

- `search_team_kb({ query, team? })` → for each root from the scope service, `KbReaderService.search`, merged, capped at 8 hits total, each snippet passed through `envelopeInbound`, each carrying `team` + repo-relative `path` as its citation.
- `read_team_kb_note({ noteId, team? })` → `KbReaderService.read`, enveloped.

Hard rules for this file:

- the tool schemas expose **no path parameter** — the model can never name a directory;
- an empty scope returns an explicit empty result, never an error that leaks whether a team exists;
- no write tool is registered.

Seed the `zibby-kb` row in `mcp.storage.service.ts` beside `zibby-entities` (`:19,37-60`), pointing at `http://localhost:{port}/api/kb/mcp`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `rtk pnpm exec vitest run apps/api/src/kb --project api`

Expected: PASS. Add a controller-level test asserting an unauthenticated request is rejected and that a request with a run id whose project has no team gets an empty result.

- [ ] **Step 7: Format, lint, commit**

```bash
rtk pnpm exec prettier --write apps/api/src/kb apps/api/src/mcp apps/api/src/app.module.ts
rtk pnpm exec eslint --fix apps/api/src/kb apps/api/src/mcp apps/api/src/app.module.ts
rtk git add apps/api/src
rtk git commit -m "feat(api): guarded zibby-kb MCP server with server-side team scoping"
```

---

### Task 8: Routing — tag a team explicitly

**Files:**

- Modify: `libs/contracts/src/tasks/task.schema.ts`
- Modify: `libs/contracts/src/chat/chat.schema.ts`
- Modify: `apps/web/features/tasks/components/CommandLine/CommandLine.tsx`
- Modify: `apps/web/features/tasks/components/CommandLine/TaskCommandLine.tsx`
- Modify: `apps/api/src/chat/chat-session.service.ts`
- Modify: the corresponding specs

**Interfaces:**

- Consumes: `useTeamsQuery` (Task 4), `KbScopeService` (Task 7).
- Produces: `teamId?: string` on `CreateTaskInput` and `SendChatMessageBody`.

**Context:** `TaskTargetSchema` (`agent | pipeline | goal | subsystem | orchestrator`) answers _who runs this_. A team answers _what it can see_. Do **not** add a `team` variant to that union — carry `teamId` as its own field beside `target`.

- [ ] **Step 1: Write the failing test**

```ts
it("carries teamId alongside an explicit target", () => {
  const body = SendChatMessageBodySchema.parse({
    text: "co víme o partner portálu?",
    teamId: "devrel",
  });
  expect(body.teamId).toBe("devrel");
});

it("does not add a team variant to TaskTarget", () => {
  expect(TaskTargetSchema.safeParse({ kind: "team", id: "devrel" }).success).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm exec vitest run libs/contracts/src/chat libs/contracts/src/tasks --project contracts`

Expected: FAIL on the first case.

- [ ] **Step 3: Add the field**

`teamId: TeamIdSchema.optional()` on `CreateTaskInput` and `SendChatMessageBody`. Leave `TaskTargetSchema` untouched.

- [ ] **Step 4: Mention picker**

In `CommandLine.tsx`, add `useTeamsQuery()` as a fourth `mentionResults` source (`:761-789`). A picked team sets `teamId`, **not** `target` — `pickMentionResult` (`:664-695`) must branch here rather than building a `TaskTarget`.

- [ ] **Step 5: Chat plumbing**

In `chat-session.service.ts`, carry `body.teamId` into the turn so the KB tools receive it, alongside the existing `setExplicitTarget` call. Follow how `conversationId` already reaches the MCP config (`:167-170`).

- [ ] **Step 6: Run tests**

Run: `rtk pnpm exec vitest run libs/contracts apps/api/src/chat --project contracts && rtk pnpm exec vitest run apps/web/features/tasks --project web-components`

Expected: PASS.

- [ ] **Step 7: Manual verification**

Register the real team and confirm the loop end to end:

```bash
rtk curl -s -X POST localhost:3333/api/teams -H 'content-type: application/json' -d '{
  "id":"devrel","name":"DevRel","companyId":"shoptet",
  "knowledgeBase":{"kind":"vault","path":"/Users/zibar/Workspace/devrel-knowledgebase","readOnly":true}
}'
```

Then, in chat, ask a DevRel question with no tag and confirm the model reaches for `search_team_kb` and cites a repo-relative path. Paste the real output into the report. **Read-only check:** confirm `git -C /Users/zibar/Workspace/devrel-knowledgebase status --porcelain` is empty afterwards — nothing in this plan may dirty that repo.

- [ ] **Step 8: Format, lint, commit**

```bash
rtk pnpm exec prettier --write libs/contracts/src apps/web/features/tasks apps/api/src/chat
rtk pnpm exec eslint --fix libs/contracts/src apps/web/features/tasks apps/api/src/chat
rtk git add libs/contracts apps/web apps/api
rtk git commit -m "feat: tag a team to scope which knowledge base a task or chat turn reads"
```

---

## Out of scope

Named here so they read as decisions, not omissions (spec §8): company-level knowledge base (Confluence-shaped, later — the union is ready for it), team-owned integrations, any write path into the KB, multiple KBs per team, a team vault mirror, budget/people inheritance through the team, the `## Team knowledge base` grounding block (v1.5), retrofitting a guard onto `/api/memory/mcp` (spec §10.3), and fixing `recall_memory`'s missing vault isolation in chat (spec §10.1).
