import { SUBSYSTEMS, SubsystemIdSchema } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { composeSeedNotes } from "./vault-seed.content";

/** Mirrors `VaultService.index()`'s entry-point filter — kept local since it's
 * private implementation detail, not exported. */
const ENTRY_POINT_RE = /(^|[-_ ])(index|moc)$/i;

describe("composeSeedNotes", () => {
  it("returns exactly 12 notes: North Star + root MOC + one shelf per registry subsystem", () => {
    const notes = composeSeedNotes(SUBSYSTEMS);
    expect(notes).toHaveLength(12);
    expect(notes.map((n) => n.id)).toContain("north-star");
    expect(notes.map((n) => n.id)).toContain("zibby-index");
  });

  it("every shelf id matches the vault's entry-point (moc/index) regex", () => {
    const notes = composeSeedNotes(SUBSYSTEMS);
    const shelves = notes.filter((n) => n.id !== "north-star" && n.id !== "zibby-index");
    expect(shelves).toHaveLength(SUBSYSTEMS.length);
    for (const shelf of shelves) {
      expect(ENTRY_POINT_RE.test(shelf.id)).toBe(true);
    }
  });

  it("every shelf carries a valid `subsystem` frontmatter tag matching the registry entry", () => {
    const notes = composeSeedNotes(SUBSYSTEMS);
    for (const subsystem of SUBSYSTEMS) {
      const shelf = notes.find((n) => n.frontmatter?.subsystem === subsystem.id);
      expect(shelf).toBeDefined();
      expect(SubsystemIdSchema.safeParse(shelf?.frontmatter?.subsystem).success).toBe(true);
      // Mandate text from the registry appears verbatim in the shelf body.
      expect(shelf?.body).toContain(subsystem.mandate);
    }
  });

  it("Codex owns the root MOC (`zibby-index`, `subsystem: codex`)", () => {
    const notes = composeSeedNotes(SUBSYSTEMS);
    const index = notes.find((n) => n.id === "zibby-index");
    expect(index?.frontmatter?.subsystem).toBe("codex");
  });

  it("the root MOC links every shelf id", () => {
    const notes = composeSeedNotes(SUBSYSTEMS);
    const index = notes.find((n) => n.id === "zibby-index");
    for (const subsystem of SUBSYSTEMS) {
      expect(index?.body).toContain(`subsystem-${subsystem.id}-moc`);
    }
  });

  it("is pure: composing twice from the same registry yields identical output", () => {
    expect(composeSeedNotes(SUBSYSTEMS)).toEqual(composeSeedNotes(SUBSYSTEMS));
  });
});
