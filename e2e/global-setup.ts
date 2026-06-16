import { promises as fs } from "node:fs";
import * as path from "node:path";
import { request } from "@playwright/test";

const API = "http://localhost:3333";
const E2E_DATA = path.resolve(".e2e-data");

/**
 * Seeds the deterministic fixtures the UI throughlines act on, and writes a
 * `locale=en` cookie into the storage state so the app renders the English strings
 * the specs select by. Runs after the webServers are up (Playwright gates them on
 * their health URLs).
 */
export default async function globalSetup(): Promise<void> {
  // English locale cookie for all tests.
  await fs.mkdir(path.resolve("e2e/.auth"), { recursive: true });
  await fs.writeFile(
    path.resolve("e2e/.auth/state.json"),
    JSON.stringify({
      cookies: [
        {
          name: "locale",
          value: "en",
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    }),
  );

  const ctx = await request.newContext({ baseURL: API });

  // Drain any pending approvals BEFORE seeding. `.e2e-data` (agent-runs, approvals)
  // persists across runs and isn't reset here, so without this a repeated `pnpm e2e`
  // accumulates stale gated-agent approvals (the queue grows to 2, 3, … cards and
  // selectors go ambiguous). Rejecting via the API clears the live in-memory queue
  // too — so this works on a `reuseExistingServer` run, where a disk wipe alone
  // wouldn't touch the already-loaded state.
  await drainPendingApprovals(ctx);

  // A skill in the catalog (skills are catalog-only — invoked by agents, not run alone).
  await ctx
    .post("/api/skills", {
      data: { id: "demo-skill", name: "Demo Skill", glyph: "spark", desc: "a demo skill", instructions: "do the demo" },
    })
    .catch(() => {});

  // A two-phase pipeline to open + run.
  await ctx
    .post("/api/pipelines", {
      data: {
        id: "demo-pipe",
        name: "Demo Pipe",
        instructions: "demo pipeline",
        phases: [
          { id: "a", agent: "demo-skill", consumes: "a.in", produces: "a.out", model: "sonnet", thinking: "medium" },
          { id: "b", agent: "demo-skill", consumes: "b.in", produces: "b.out", model: "sonnet", thinking: "medium" },
        ],
      },
    })
    .catch(() => {});

  // A gated agent + a task dispatched to it → a pending approval for the overview queue.
  // The run is started the only way a run can start now: by creating a task that carries
  // the agent as its target (the unified entry path; no direct `/agents/:id/run`). The
  // explicit target skips classification, so dispatch is deterministic.
  await ctx
    .post("/api/agents", {
      data: { id: "gated-agent", name: "Gated Agent", instructions: "needs approval", requires_approval: true, risk: "high" },
    })
    .catch(() => {});
  await ctx
    .post("/api/tasks", {
      data: {
        text: "do something risky",
        paths: [],
        target: { kind: "agent", id: "gated-agent", name: "Gated Agent", glyph: "bot" },
      },
    })
    .catch(() => {});

  // A channel integration + credentials + a Tier-3 fixture message, so the watcher
  // (CHANNEL_TICK_MS small) triages it into a pending channel approval unprompted.
  // Reset the fake dir first so a re-run's cursor/items don't linger.
  const fakeDir = path.join(E2E_DATA, "channel-fake");
  await fs.rm(fakeDir, { recursive: true, force: true });
  await fs.rm(path.join(E2E_DATA, "channels"), { recursive: true, force: true });
  await ctx
    .post("/api/integrations", {
      data: { id: "team-slack", kind: "slack", name: "Team Slack", config: { kind: "slack", channels: ["C1"] } },
    })
    .catch(() => {});
  await ctx.put("/api/integrations/team-slack/credentials", { data: { token: "xoxb-e2e" } }).catch(() => {});
  await fs.mkdir(path.join(fakeDir, "team-slack"), { recursive: true });
  // Unique id per seed: a reused dev server (`reuseExistingServer` on repeated local
  // runs) keeps the channel watcher's processed-id set in memory, so a fixed id like
  // "001" gets deduped and never re-triages. A fresh id each run always ingests.
  const fixtureId = Date.now().toString(36);
  await fs.writeFile(
    path.join(fakeDir, "team-slack", `${fixtureId}.json`),
    JSON.stringify({ text: "Tady je nabídka a smlouva s deadline na příští týden", receivedAt: new Date().toISOString() }),
  );

  // A small wiki-linked vault for the memory graph. Reset it first so notes a
  // previous run created through the UI (e.g. the create-note spec) don't linger
  // and turn a re-create into a 409 — the fixtures must be deterministic.
  const vault = path.join(E2E_DATA, "vault");
  await fs.rm(vault, { recursive: true, force: true });
  await fs.mkdir(path.join(vault, "knowledge"), { recursive: true });
  await fs.mkdir(path.join(vault, "daily"), { recursive: true });
  await fs.writeFile(path.join(vault, "MEMORY.md"), "---\ntitle: Memory\n---\nSee [[rohlik]] and [[zibby]].\n");
  await fs.writeFile(path.join(vault, "north-star.md"), "---\ntitle: North Star\n---\nThe mission of ZIBBY.\n");
  await fs.writeFile(path.join(vault, "knowledge", "rohlik.md"), "---\ntitle: Rohlik\n---\nGroceries [[zibby]].\n");
  await fs.writeFile(path.join(vault, "knowledge", "zibby.md"), "---\ntitle: Zibby\n---\nThe orchestrator note.\n");
  // A daily note (id = today's date) so the memory screen's daily timeline has a row.
  const today = new Date().toISOString().slice(0, 10);
  await fs.writeFile(path.join(vault, "daily", `${today}.md`), `---\ntitle: ${today}\n---\n- 09:00 seeded daily entry\n`);

  // Wait until both seeded approvals are actually pending before any spec runs. The
  // agent approval is produced asynchronously by the demo runner; the channel one by
  // the watcher's next tick. Specs run alphabetically against ONE shared queue, so a
  // not-yet-present approval used to manifest as a cross-spec seesaw (whichever spec
  // raced ahead won). Gating here makes the queue deterministic at suite start.
  await waitForPendingApproval(ctx, "agent");
  await waitForPendingApproval(ctx, "channel");

  await ctx.dispose();
}

/** Reject every currently-pending approval so the suite starts with an empty queue. */
async function drainPendingApprovals(
  ctx: Awaited<ReturnType<typeof request.newContext>>,
): Promise<void> {
  const res = await ctx.get("/api/approvals", { params: { status: "pending" } }).catch(() => null);
  if (!res?.ok()) return;
  const pending = (await res.json().catch(() => [])) as Array<{ id?: string }>;
  if (!Array.isArray(pending)) return;
  for (const a of pending) {
    if (a.id) await ctx.post(`/api/approvals/${a.id}/reject`).catch(() => {});
  }
}

/** Poll `GET /api/approvals?status=pending` until an approval of `kind` exists. */
async function waitForPendingApproval(
  ctx: Awaited<ReturnType<typeof request.newContext>>,
  kind: string,
  timeoutMs = 20000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await ctx.get("/api/approvals", { params: { status: "pending" } }).catch(() => null);
    if (res?.ok()) {
      const pending = (await res.json().catch(() => [])) as Array<{ kind?: string }>;
      if (Array.isArray(pending) && pending.some((a) => a.kind === kind)) return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  // Don't hard-fail setup: a spec's own 20s wait still covers a slow producer, and
  // failing setup would abort the whole suite. Surface it for triage instead.
  console.warn(`[global-setup] no pending "${kind}" approval after ${timeoutMs}ms`);
}
