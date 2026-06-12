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

  // A gated agent + a started run → a pending approval for the overview queue.
  await ctx
    .post("/api/agents", {
      data: { id: "gated-agent", name: "Gated Agent", instructions: "needs approval", requires_approval: true, risk: "high" },
    })
    .catch(() => {});
  await ctx
    .post("/api/agents/gated-agent/run", { data: { prompt: "do something risky", project: "zibby-core" } })
    .catch(() => {});

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

  await ctx.dispose();
}
