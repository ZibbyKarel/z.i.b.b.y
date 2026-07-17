import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GroundingService,
  SELF_KNOWLEDGE_ID,
  scoreEntry,
  selectIndexes,
  selectLinkedNotes,
  visibleToProject,
} from "./grounding.service";
import { VaultService, ownerProjectOf } from "./vault.service";

/** Build a service over a fresh temp vault seeded by `seed`. */
async function makeVault(
  seed: (vault: VaultService) => Promise<void>,
): Promise<{ dir: string; grounding: GroundingService }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "grounding-"));
  const vault = new VaultService(dir);
  await vault.onModuleInit();
  await seed(vault);
  return { dir, grounding: new GroundingService(vault) };
}

describe("selectIndexes", () => {
  const entries = [
    { id: "rohlik-moc", title: "Rohlik Delivery", tier: "knowledge" as const },
    { id: "billing-moc", title: "Billing", tier: "knowledge" as const },
    { id: "infra-moc", title: "Infra Notes", tier: "knowledge" as const },
  ];

  it("picks entries whose id/title tokens overlap the terms", () => {
    expect(selectIndexes(["billing"], entries).map((e) => e.id)).toEqual(["billing-moc"]);
  });

  it("caps at the top 2 by overlap, ties broken by id", () => {
    const picked = selectIndexes(["moc", "rohlik", "billing", "infra"], entries);
    expect(picked).toHaveLength(2);
  });

  it("returns nothing when no term overlaps or terms are empty", () => {
    expect(selectIndexes(["nothing"], entries)).toEqual([]);
    expect(selectIndexes([], entries)).toEqual([]);
  });

  it("F4b: a tag/alias match outranks an incidental title word", () => {
    const scored = [
      // Title has zero term overlap; tags match both wanted terms.
      {
        id: "a-moc",
        title: "Untitled Notes",
        tier: "knowledge" as const,
        tags: ["billing", "infra"],
      },
      // Title matches one term ("billing"), no curated tags.
      { id: "b-moc", title: "Billing Overview", tier: "knowledge" as const },
    ];
    const picked = selectIndexes(["billing", "infra"], scored);
    expect(picked.map((e) => e.id)).toEqual(["a-moc", "b-moc"]);
  });
});

describe("scoreEntry", () => {
  it("scores 1 point per term matched in id/title, 2 per term matched in tags/aliases", () => {
    const wanted = new Set(["billing", "infra"]);
    expect(scoreEntry({ id: "x", title: "Billing Infra Notes", tier: "knowledge" }, wanted)).toBe(
      2,
    );
    expect(
      scoreEntry(
        { id: "x", title: "Untitled", tier: "knowledge", tags: ["billing", "infra"] },
        wanted,
      ),
    ).toBe(4);
  });

  it("credits both title and curated overlap for the same term", () => {
    const wanted = new Set(["billing"]);
    expect(
      scoreEntry(
        { id: "billing-moc", title: "Billing", tier: "knowledge", aliases: ["billing"] },
        wanted,
      ),
    ).toBe(3);
  });

  it("scores 0 when nothing overlaps", () => {
    expect(scoreEntry({ id: "x", title: "Y", tier: "knowledge" }, new Set(["z"]))).toBe(0);
  });
});

describe("selectLinkedNotes (1-hop wikilink expansion)", () => {
  const note = (id: string, links: string[]): import("@zibby/contracts").Note => ({
    id,
    path: `knowledge/${id}.md`,
    tier: "knowledge",
    title: id,
    frontmatter: {},
    links,
  });

  it("unions the linked notes of the grounded MOCs, scored and capped at EXPANSION_LIMIT", () => {
    const visible = [
      { id: "deploy-runbook", title: "Deploy Runbook", tier: "knowledge" as const },
      { id: "noise-note", title: "Noise", tier: "knowledge" as const },
    ];
    const mocs = [note("forge-moc", ["deploy-runbook", "noise-note"])];
    const picked = selectLinkedNotes(["deploy"], mocs, visible, new Set(["forge-moc"]));
    expect(picked).toEqual(["deploy-runbook"]);
  });

  it("excludes a linked note not present in `visible` (M7 project isolation holds through expansion)", () => {
    const visible = [{ id: "own-note", title: "Deploy Runbook", tier: "knowledge" as const }];
    const mocs = [note("forge-moc", ["deploy-runbook", "own-note"])];
    // "deploy-runbook" is linked but NOT in `visible` (another project's note) — excluded.
    const picked = selectLinkedNotes(["deploy"], mocs, visible, new Set());
    expect(picked).toEqual(["own-note"]);
  });

  it("excludes ids already in alreadySeen", () => {
    const visible = [{ id: "deploy-runbook", title: "Deploy Runbook", tier: "knowledge" as const }];
    const mocs = [note("forge-moc", ["deploy-runbook"])];
    const picked = selectLinkedNotes(["deploy"], mocs, visible, new Set(["deploy-runbook"]));
    expect(picked).toEqual([]);
  });

  it("returns nothing when terms is empty", () => {
    const visible = [{ id: "deploy-runbook", title: "Deploy Runbook", tier: "knowledge" as const }];
    const mocs = [note("forge-moc", ["deploy-runbook"])];
    expect(selectLinkedNotes([], mocs, visible, new Set())).toEqual([]);
  });
});

describe("ownerProjectOf", () => {
  it("reads an explicit project tag", () => {
    expect(ownerProjectOf({ project: "alpha" })).toBe("alpha");
  });
  it("falls back to a type:project profile's id", () => {
    expect(ownerProjectOf({ type: "project", id: "beta" })).toBe("beta");
  });
  it("is undefined for a global note", () => {
    expect(ownerProjectOf({ title: "Knowledge" })).toBeUndefined();
    expect(ownerProjectOf({ project: "" })).toBeUndefined();
  });
});

describe("visibleToProject (M7 isolation)", () => {
  const entries = [
    { id: "global-moc", title: "Global", tier: "knowledge" as const },
    { id: "alpha-moc", title: "Alpha", tier: "knowledge" as const, project: "alpha" },
    { id: "beta-moc", title: "Beta", tier: "knowledge" as const, project: "beta" },
  ];

  it("a project run sees global + its own notes, never another project's", () => {
    expect(visibleToProject(entries, "alpha").map((e) => e.id)).toEqual([
      "global-moc",
      "alpha-moc",
    ]);
  });

  it("an unattributed run sees only global notes", () => {
    expect(visibleToProject(entries, undefined).map((e) => e.id)).toEqual(["global-moc"]);
  });
});

describe("GroundingService.compose", () => {
  let dir: string | null = null;
  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
    dir = null;
  });

  const seedFull = async (vault: VaultService): Promise<void> => {
    await vault.createNote({
      id: "north-star",
      tier: "memory",
      title: "North Star",
      body: "The mission.",
    });
    await vault.createNote({
      id: "rohlik-moc",
      tier: "knowledge",
      title: "Rohlik Delivery",
      body: "Grocery delivery project.",
    });
    await vault.createNote({
      id: "billing-moc",
      tier: "knowledge",
      title: "Billing",
      body: "Invoices.",
    });
    await vault.createNote({ id: "noise", tier: "knowledge", title: "Noise", body: "Irrelevant." });
    await vault.createNote({
      id: "acme",
      tier: "knowledge",
      title: "ACME Project",
      body: "The project note.",
    });
  };

  it("always puts the North Star first", async () => {
    const made = await makeVault(seedFull);
    dir = made.dir;
    const block = await made.grounding.compose({ task: "rohlik delivery question" });
    expect(block).toContain("## Grounding (vault)");
    const nsAt = block.indexOf("North Star");
    const rohlikAt = block.indexOf("Rohlik Delivery");
    expect(nsAt).toBeGreaterThan(-1);
    expect(rohlikAt).toBeGreaterThan(nsAt);
  });

  it("matchedTerms pick the right MOC; tokenized-task fallback picks the same", async () => {
    const made = await makeVault(seedFull);
    dir = made.dir;
    const viaTerms = await made.grounding.compose({ task: "anything", matchedTerms: ["billing"] });
    expect(viaTerms).toContain("Billing");
    expect(viaTerms).not.toContain("Rohlik Delivery");

    const viaTask = await made.grounding.compose({ task: "a billing invoice issue" });
    expect(viaTask).toContain("Billing");
  });

  it("includes the project note when projectId is given", async () => {
    const made = await makeVault(seedFull);
    dir = made.dir;
    const block = await made.grounding.compose({ task: "x", projectId: "acme" });
    expect(block).toContain("ACME Project");
  });

  it("caps MOCs at two beyond the North Star + project note", async () => {
    const made = await makeVault(seedFull);
    dir = made.dir;
    // "moc" matches all three *-moc ids, but only the top 2 are included.
    const block = await made.grounding.compose({
      task: "x",
      matchedTerms: ["moc", "rohlik", "billing"],
    });
    const headings = block.match(/^### /gm) ?? [];
    // North Star + 2 MOCs = 3 sections.
    expect(headings.length).toBe(3);
  });

  it("never grounds on another project's notes, even on a term match (M7 isolation)", async () => {
    const made = await makeVault(async (vault) => {
      await vault.createNote({
        id: "north-star",
        tier: "memory",
        title: "North Star",
        body: "Mission.",
      });
      await vault.createNote({
        id: "alpha-moc",
        tier: "knowledge",
        title: "Alpha Roadmap",
        body: "Project alpha roadmap.",
        frontmatter: { project: "alpha" },
      });
      await vault.createNote({
        id: "beta-moc",
        tier: "knowledge",
        title: "Beta Roadmap",
        body: "Project beta roadmap.",
        frontmatter: { project: "beta" },
      });
    });
    dir = made.dir;
    // "roadmap" matches BOTH MOCs by title, but a run in alpha must see only alpha's.
    const block = await made.grounding.compose({
      task: "x",
      matchedTerms: ["roadmap"],
      projectId: "alpha",
    });
    expect(block).toContain("Alpha Roadmap");
    expect(block).not.toContain("Beta Roadmap");
  });

  it("F4b: 1-hop expansion recovers a linked note that direct MOC selection excluded, respecting M7 isolation", async () => {
    // Both `visible` (index-first candidate set) and `selectLinkedNotes`'s expansion
    // set derive from the SAME `vault.index()` entries — only "-moc"/"-index"-suffixed
    // notes are entry points (`vault.service.ts` `index()`), so the linked target must
    // be one too, exactly as real subsystem/project MOCs link to one another.
    const made = await makeVault(async (vault) => {
      await vault.createNote({
        id: "north-star",
        tier: "memory",
        title: "North Star",
        body: "Mission.",
      });
      // Both score 2 (title matches BOTH terms) — the two direct MOC_LIMIT=2 slots.
      await vault.createNote({
        id: "forge-moc",
        tier: "knowledge",
        title: "Forge Deploy Hub",
        body: "The forge deploy pipeline. See [[deploy-runbook-moc]] and [[foreign-linked-moc]].",
        frontmatter: { project: "acme" },
      });
      await vault.createNote({
        id: "ops-moc",
        tier: "knowledge",
        title: "Ops Forge Deploy Notes",
        body: "Operational notes.",
        frontmatter: { project: "acme" },
      });
      // Scores only 1 (matches "deploy" alone) — outranked by both MOCs above, so direct
      // top-2 selection excludes it; only reachable via forge-moc's wikilink (expansion).
      await vault.createNote({
        id: "deploy-runbook-moc",
        tier: "knowledge",
        title: "Deploy Runbook",
        body: "How to deploy the forge.",
        frontmatter: { project: "acme" },
      });
      // Linked from forge-moc but owned by a different project — filtered out of
      // `visible` before expansion ever sees it (M7 isolation holds through expansion).
      await vault.createNote({
        id: "foreign-linked-moc",
        tier: "knowledge",
        title: "Foreign Deploy Notes",
        body: "Another project's deploy notes.",
        frontmatter: { project: "beta" },
      });
    });
    dir = made.dir;
    const block = await made.grounding.compose({
      task: "x",
      matchedTerms: ["forge", "deploy"],
      projectId: "acme",
    });
    expect(block).toContain("Forge Deploy Hub");
    expect(block).toContain("Ops Forge Deploy Notes");
    // Recovered exclusively via 1-hop expansion — direct selectIndexes ranked it 3rd.
    expect(block).toContain("Deploy Runbook");
    expect(block).not.toContain("Foreign Deploy Notes");
    const headings = block.match(/^### /gm) ?? [];
    // North Star + forge-moc + ops-moc + the one expanded note.
    expect(headings.length).toBe(4);
  });

  it("F4b: composing the same fixture twice yields byte-identical blocks (determinism)", async () => {
    const made = await makeVault(async (vault) => {
      await vault.createNote({
        id: "north-star",
        tier: "memory",
        title: "North Star",
        body: "Mission.",
      });
      await vault.createNote({
        id: "forge-moc",
        tier: "knowledge",
        title: "Forge MOC",
        body: "See [[deploy-runbook-moc]].",
      });
      await vault.createNote({
        id: "deploy-runbook-moc",
        tier: "knowledge",
        title: "Deploy Runbook",
        body: "How to deploy.",
      });
    });
    dir = made.dir;
    const input = { task: "x", matchedTerms: ["forge", "deploy"] };
    const first = await made.grounding.compose(input);
    const second = await made.grounding.compose(input);
    expect(first).toBe(second);
    expect(first).toContain("Deploy Runbook");
  });

  it("truncates an oversized note body with a marker", async () => {
    const made = await makeVault(async (vault) => {
      await vault.createNote({
        id: "north-star",
        tier: "memory",
        title: "North Star",
        body: "x".repeat(5000),
      });
    });
    dir = made.dir;
    const block = await made.grounding.compose({ task: "x" });
    expect(block).toContain("…(truncated)");
    expect(block.length).toBeLessThanOrEqual(8000 + 100);
  });

  it("returns '' for an empty vault", async () => {
    const made = await makeVault(async () => {});
    dir = made.dir;
    expect(await made.grounding.compose({ task: "x" })).toBe("");
  });

  it("composes from the rest when the North Star is missing", async () => {
    const made = await makeVault(async (vault) => {
      await vault.createNote({
        id: "billing-moc",
        tier: "knowledge",
        title: "Billing",
        body: "Invoices.",
      });
    });
    dir = made.dir;
    const block = await made.grounding.compose({ task: "x", matchedTerms: ["billing"] });
    expect(block).toContain("Billing");
    expect(block).not.toContain("North Star");
  });

  it("always grounds the self-knowledge note right after the North Star (Fáze 1)", async () => {
    const made = await makeVault(async (vault) => {
      await vault.createNote({
        id: "north-star",
        tier: "memory",
        title: "North Star",
        body: "The mission.",
      });
      await vault.createNote({
        id: SELF_KNOWLEDGE_ID,
        tier: "knowledge",
        title: "Self-Knowledge",
        body: "Agents, pipelines, gates, channels.",
      });
      await vault.createNote({
        id: "billing-moc",
        tier: "knowledge",
        title: "Billing",
        body: "Invoices.",
      });
    });
    dir = made.dir;
    const block = await made.grounding.compose({ task: "x", matchedTerms: ["billing"] });
    const nsAt = block.indexOf("North Star");
    const skAt = block.indexOf("Self-Knowledge");
    const billingAt = block.indexOf("Billing");
    expect(nsAt).toBeGreaterThan(-1);
    expect(skAt).toBeGreaterThan(nsAt);
    expect(billingAt).toBeGreaterThan(skAt);
  });

  it("fails open when the self-knowledge note is absent (never seeded yet)", async () => {
    const made = await makeVault(async (vault) => {
      await vault.createNote({
        id: "north-star",
        tier: "memory",
        title: "North Star",
        body: "The mission.",
      });
    });
    dir = made.dir;
    const block = await made.grounding.compose({ task: "x" });
    expect(block).toContain("North Star");
    expect(block).not.toContain("Self-Knowledge");
  });

  it("F4a: compose with ownerSubsystem includes the shelf between self-knowledge and term-matched MOCs", async () => {
    const made = await makeVault(async (vault) => {
      await vault.createNote({
        id: "north-star",
        tier: "memory",
        title: "North Star",
        body: "The mission.",
      });
      await vault.createNote({
        id: SELF_KNOWLEDGE_ID,
        tier: "knowledge",
        title: "Self-Knowledge",
        body: "Agents, pipelines, gates, channels.",
      });
      await vault.createNote({
        id: "subsystem-forge-moc",
        tier: "knowledge",
        title: "Forge — polička",
        body: "The delivery forge's shelf.",
        frontmatter: { subsystem: "forge" },
      });
      await vault.createNote({
        id: "billing-moc",
        tier: "knowledge",
        title: "Billing",
        body: "Invoices.",
      });
    });
    dir = made.dir;
    const block = await made.grounding.compose({
      task: "x",
      matchedTerms: ["billing"],
      ownerSubsystem: "forge",
    });
    const nsAt = block.indexOf("North Star");
    const skAt = block.indexOf("Self-Knowledge");
    const shelfAt = block.indexOf("Forge — polička");
    const billingAt = block.indexOf("Billing");
    expect(nsAt).toBeGreaterThan(-1);
    expect(skAt).toBeGreaterThan(nsAt);
    expect(shelfAt).toBeGreaterThan(skAt);
    expect(billingAt).toBeGreaterThan(shelfAt);
  });

  it("F4a: absent shelf note → composed block identical to no ownerSubsystem", async () => {
    const made = await makeVault(async (vault) => {
      await vault.createNote({
        id: "north-star",
        tier: "memory",
        title: "North Star",
        body: "The mission.",
      });
      await vault.createNote({
        id: "billing-moc",
        tier: "knowledge",
        title: "Billing",
        body: "Invoices.",
      });
    });
    dir = made.dir;
    const withOwner = await made.grounding.compose({
      task: "x",
      matchedTerms: ["billing"],
      ownerSubsystem: "forge",
    });
    const withoutOwner = await made.grounding.compose({ task: "x", matchedTerms: ["billing"] });
    expect(withOwner).toBe(withoutOwner);
  });

  it("F4a: no ownerSubsystem in the input → unchanged (regression)", async () => {
    const made = await makeVault(seedFull);
    dir = made.dir;
    const block = await made.grounding.compose({ task: "rohlik delivery question" });
    expect(block).toContain("## Grounding (vault)");
    expect(block).toContain("North Star");
    expect(block).not.toContain("polička");
  });

  it("never throws on an unreadable vault → ''", async () => {
    // A vault whose dir was removed: note()/index() reject, compose must swallow it.
    const bad = new VaultService(path.join(os.tmpdir(), "does-not-exist-zibby", "vault"));
    const grounding = new GroundingService(bad);
    expect(await grounding.compose({ task: "x" })).toBe("");
  });
});
