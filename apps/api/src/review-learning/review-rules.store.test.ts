import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ReviewRuleOccurrence } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReviewRulesStore } from "./review-rules.store";

const NOW = new Date("2026-07-29T10:00:00.000Z");

function occurrence(commentId: string): ReviewRuleOccurrence {
  return {
    commentId,
    prUrl: "https://github.com/acme/app/pull/7",
    commentUrl: `https://github.com/acme/app/pull/7#${commentId}`,
    author: "kolega",
    at: NOW.toISOString(),
    excerpt: "primitivy patří do design systemu",
  };
}

const INPUT = {
  slug: "no-local-primitives",
  rule: "Primitivy ber z libs/design-system.",
  rationale: "Opakovaná výtka.",
};

describe("ReviewRulesStore", () => {
  let dir: string;
  let store: ReviewRulesStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "review-rules-"));
    store = new ReviewRulesStore(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("files a first occurrence as observed and proposes nothing", async () => {
    const proposed = await store.record("acme", { ...INPUT, occurrence: occurrence("rc-1") }, NOW);

    expect(proposed).toBeNull();
    const rules = await store.list("acme");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.status).toBe("observed");
    expect(rules[0]?.occurrences).toHaveLength(1);
  });

  it("promotes to proposed on the second occurrence and returns the rule once", async () => {
    await store.record("acme", { ...INPUT, occurrence: occurrence("rc-1") }, NOW);
    const proposed = await store.record("acme", { ...INPUT, occurrence: occurrence("rc-2") }, NOW);

    expect(proposed?.status).toBe("proposed");
    expect(proposed?.occurrences).toHaveLength(2);

    // A third occurrence must not re-propose an already-parked rule.
    const again = await store.record("acme", { ...INPUT, occurrence: occurrence("rc-3") }, NOW);
    expect(again).toBeNull();
  });

  it("never counts the same commentId twice", async () => {
    await store.record("acme", { ...INPUT, occurrence: occurrence("rc-1") }, NOW);
    const replay = await store.record("acme", { ...INPUT, occurrence: occurrence("rc-1") }, NOW);

    expect(replay).toBeNull();
    const rules = await store.list("acme");
    expect(rules[0]?.occurrences).toHaveLength(1);
  });

  it("keeps counting a retired rule but never re-proposes it", async () => {
    await store.record("acme", { ...INPUT, occurrence: occurrence("rc-1") }, NOW);
    await store.record("acme", { ...INPUT, occurrence: occurrence("rc-2") }, NOW);
    await store.setStatus("acme", INPUT.slug, "retired");

    const proposed = await store.record("acme", { ...INPUT, occurrence: occurrence("rc-3") }, NOW);

    expect(proposed).toBeNull();
    const rules = await store.list("acme");
    expect(rules[0]?.status).toBe("retired");
    expect(rules[0]?.occurrences).toHaveLength(3);
  });

  it("lists only active rules for grounding, split by scope", async () => {
    await store.record("acme", { ...INPUT, occurrence: occurrence("rc-1") }, NOW);
    await store.record("acme", { ...INPUT, occurrence: occurrence("rc-2") }, NOW);
    await store.setStatus("acme", INPUT.slug, "active", "ap-1");

    await store.record(
      "acme",
      { slug: "no-any", rule: "Nepoužívej any.", occurrence: occurrence("rc-9") },
      NOW,
    );

    const grounded = await store.listGrounded("acme");
    expect(grounded.project.map((r) => r.id)).toEqual([INPUT.slug]);
    expect(grounded.global).toEqual([]);
  });

  it("moves a promoted rule into the global file with its occurrences", async () => {
    await store.record("acme", { ...INPUT, occurrence: occurrence("rc-1") }, NOW);
    await store.record("acme", { ...INPUT, occurrence: occurrence("rc-2") }, NOW);
    await store.setStatus("acme", INPUT.slug, "active", "ap-1");

    const promoted = await store.promoteToGlobal("acme", INPUT.slug);

    expect(promoted?.scope).toBe("global");
    expect(promoted?.occurrences).toHaveLength(2);
    expect(await store.list("acme")).toEqual([]);
    const grounded = await store.listGrounded("acme");
    expect(grounded.global.map((r) => r.id)).toEqual([INPUT.slug]);
  });

  it("round-trips the cursor and tolerates a missing file", async () => {
    expect(await store.cursor("acme")).toBeUndefined();
    await store.setCursor("acme", NOW.toISOString());
    expect(await store.cursor("acme")).toBe(NOW.toISOString());
  });

  it("reads a corrupt file as empty instead of throwing", async () => {
    await fs.writeFile(path.join(dir, "acme.json"), "{ not json", "utf8");
    expect(await store.list("acme")).toEqual([]);
  });
});
