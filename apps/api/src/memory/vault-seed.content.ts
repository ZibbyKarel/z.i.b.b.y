import type { CreateNoteInput, Department } from "@zibby/contracts";
import { departmentShelfId } from "./department-shelf";

/** A short starter mission note for a genuinely fresh install (empty vault). */
const NORTH_STAR_STUB = `# North Star

ZIBBY is a self-hosted, file-based agentic OS with a single operator. You hand
it a goal — not a script — and it gets the work done. This is a starter
mission note; replace it with your own North Star as ZIBBY grows with you.
Files are the source of truth — the UI is a view.
`;

/** The root MOC body — a `Oddělení` section linking every shelf (F4a id scheme). */
function zibbyIndexBody(departments: readonly Department[]): string {
  const rows = departments.map((s) => `- [[${departmentShelfId(s.id)}]] — ${s.mandate}`).join("\n");
  return `Map of content for the ZIBBY vault — the entry point for retrieval.
Index-first, not vector search: descriptive notes joined by \`[[wiki-links]]\`.

## Foundations

- [[north-star]] — the operator's mission and the non-negotiable laws

## Oddělení

${rows}

## Projects

_Project memory notes accumulate here as runs record what they learned._
`;
}

/** A department shelf body — content generated straight from the registry (single
 * source of truth, no duplicated prose). */
function shelfBody(department: Department): string {
  return `${department.name} — ${department.tagline}. ${department.mandate}

## Poznatky

[[zibby-index]]
`;
}

/**
 * The fresh-install seed set (F4c): the North Star stub, the root MOC (owned by
 * Knowledge, linking every shelf), and one flat shelf per registry department
 * (`department-<id>-moc`, F4a's id scheme). Pure — no I/O, easy to test; the
 * caller (`VaultSeedService`) decides WHEN to write these (empty vault only).
 */
export function composeSeedNotes(departments: readonly Department[]): CreateNoteInput[] {
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
    body: zibbyIndexBody(departments),
    frontmatter: { department: "knw" },
  };
  const shelves: CreateNoteInput[] = departments.map((department) => ({
    id: departmentShelfId(department.id),
    tier: "knowledge",
    title: `${department.name} — polička`,
    body: shelfBody(department),
    type: "fact",
    tags: ["department", department.id, "moc"],
    frontmatter: { department: department.id },
  }));
  return [northStar, zibbyIndex, ...shelves];
}
