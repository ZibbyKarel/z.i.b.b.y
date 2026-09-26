import { DEPARTMENTS, DepartmentIdSchema } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { composeSeedNotes } from "./vault-seed.content";

/** Mirrors `VaultService.index()`'s entry-point filter — kept local since it's
 * private implementation detail, not exported. */
const ENTRY_POINT_RE = /(^|[-_ ])(index|moc)$/i;

describe("composeSeedNotes", () => {
  it("returns exactly 13 notes: North Star + root MOC + one shelf per registry department", () => {
    const notes = composeSeedNotes(DEPARTMENTS);
    expect(notes).toHaveLength(13);
    expect(notes.map((n) => n.id)).toContain("north-star");
    expect(notes.map((n) => n.id)).toContain("zibby-index");
  });

  it("every shelf id matches the vault's entry-point (moc/index) regex", () => {
    const notes = composeSeedNotes(DEPARTMENTS);
    const shelves = notes.filter((n) => n.id !== "north-star" && n.id !== "zibby-index");
    expect(shelves).toHaveLength(DEPARTMENTS.length);
    for (const shelf of shelves) {
      expect(ENTRY_POINT_RE.test(shelf.id)).toBe(true);
    }
  });

  it("every shelf carries a valid `department` frontmatter tag matching the registry entry", () => {
    const notes = composeSeedNotes(DEPARTMENTS);
    for (const department of DEPARTMENTS) {
      const shelf = notes.find((n) => n.frontmatter?.department === department.id);
      expect(shelf).toBeDefined();
      expect(DepartmentIdSchema.safeParse(shelf?.frontmatter?.department).success).toBe(true);
      // Mandate text from the registry appears verbatim in the shelf body.
      expect(shelf?.body).toContain(department.mandate);
    }
  });

  it("Knowledge owns the root MOC (`zibby-index`, `department: knowledge`)", () => {
    const notes = composeSeedNotes(DEPARTMENTS);
    const index = notes.find((n) => n.id === "zibby-index");
    expect(index?.frontmatter?.department).toBe("knw");
  });

  it("the root MOC links every shelf id", () => {
    const notes = composeSeedNotes(DEPARTMENTS);
    const index = notes.find((n) => n.id === "zibby-index");
    for (const department of DEPARTMENTS) {
      expect(index?.body).toContain(`department-${department.id}-moc`);
    }
  });

  it("is pure: composing twice from the same registry yields identical output", () => {
    expect(composeSeedNotes(DEPARTMENTS)).toEqual(composeSeedNotes(DEPARTMENTS));
  });
});
