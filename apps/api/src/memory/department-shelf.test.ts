import { describe, expect, it } from "vitest";
import { SHELF_ID_PREFIX, departmentShelfId, shelfDailyLink } from "./department-shelf";

/** Mirrors `VaultService.index()`'s entry-point regex — see `vault.service.ts:186`. */
const ENTRY_POINT_RE = /(^|[-_ ])(index|moc)$/i;

describe("departmentShelfId", () => {
  it("builds the flat `department-<id>-moc` shape", () => {
    expect(departmentShelfId("dev")).toBe("department-dev-moc");
    expect(departmentShelfId("rnd")).toBe("department-rnd-moc");
  });

  it("starts with SHELF_ID_PREFIX", () => {
    expect(departmentShelfId("ops").startsWith(SHELF_ID_PREFIX)).toBe(true);
  });

  it("matches the vault's index/MOC entry-point regex", () => {
    expect(ENTRY_POINT_RE.test(departmentShelfId("dev"))).toBe(true);
    expect(ENTRY_POINT_RE.test(departmentShelfId("fin"))).toBe(true);
  });
});

describe("shelfDailyLink", () => {
  it("builds an alias-form wikilink pointing at the shelf, labeled with the bare id", () => {
    expect(shelfDailyLink("dev")).toBe("[[department-dev-moc|dev]]");
  });

  it("the link target matches departmentShelfId (real graph edge)", () => {
    const link = shelfDailyLink("rnd");
    expect(link).toContain(departmentShelfId("rnd"));
  });
});
