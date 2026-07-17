import type { CreateNoteInput, Subsystem } from "@zibby/contracts";
import { subsystemShelfId } from "./subsystem-shelf";

/** A short starter mission note for a genuinely fresh install (empty vault). */
const NORTH_STAR_STUB = `# North Star

ZIBBY is a self-hosted, file-based agentic OS with a single operator. You hand
it a goal — not a script — and it gets the work done. This is a starter
mission note; replace it with your own North Star as ZIBBY grows with you.
Files are the source of truth — the UI is a view.
`;

/** The root MOC body — a `Subsystémy` section linking every shelf (F4a id scheme). */
function zibbyIndexBody(subsystems: readonly Subsystem[]): string {
  const rows = subsystems.map((s) => `- [[${subsystemShelfId(s.id)}]] — ${s.mandate}`).join("\n");
  return `Map of content for the ZIBBY vault — the entry point for retrieval.
Index-first, not vector search: descriptive notes joined by \`[[wiki-links]]\`.

## Foundations

- [[north-star]] — the operator's mission and the non-negotiable laws

## Subsystémy

${rows}

## Projects

_Project memory notes accumulate here as runs record what they learned._
`;
}

/** A subsystem shelf body — content generated straight from the registry (single
 * source of truth, no duplicated prose). */
function shelfBody(subsystem: Subsystem): string {
  return `${subsystem.name} — ${subsystem.tagline}. ${subsystem.mandate}

## Poznatky

[[zibby-index]]
`;
}

/**
 * The fresh-install seed set (F4c): the North Star stub, the root MOC (owned by
 * Codex, linking every shelf), and one flat shelf per registry subsystem
 * (`subsystem-<id>-moc`, F4a's id scheme). Pure — no I/O, easy to test; the
 * caller (`VaultSeedService`) decides WHEN to write these (empty vault only).
 */
export function composeSeedNotes(subsystems: readonly Subsystem[]): CreateNoteInput[] {
  const northStar: CreateNoteInput = {
    id: "north-star",
    tier: "memory",
    title: "North Star",
    body: NORTH_STAR_STUB,
    frontmatter: { type: "vision", tags: ["north-star", "vision"] },
  };
  const zibbyIndex: CreateNoteInput = {
    id: "zibby-index",
    tier: "knowledge",
    title: "ZIBBY Index",
    body: zibbyIndexBody(subsystems),
    frontmatter: { subsystem: "codex" },
  };
  const shelves: CreateNoteInput[] = subsystems.map((subsystem) => ({
    id: subsystemShelfId(subsystem.id),
    tier: "knowledge",
    title: `${subsystem.name} — polička`,
    body: shelfBody(subsystem),
    type: "fact",
    tags: ["subsystem", subsystem.id, "moc"],
    frontmatter: { subsystem: subsystem.id },
  }));
  return [northStar, zibbyIndex, ...shelves];
}
