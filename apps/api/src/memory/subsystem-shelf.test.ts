import { describe, expect, it } from "vitest";
import { SHELF_ID_PREFIX, shelfDailyLink, subsystemShelfId } from "./subsystem-shelf";

/** Mirrors `VaultService.index()`'s entry-point regex — see `vault.service.ts:186`. */
const ENTRY_POINT_RE = /(^|[-_ ])(index|moc)$/i;

describe("subsystemShelfId", () => {
  it("builds the flat `subsystem-<id>-moc` shape", () => {
    expect(subsystemShelfId("forge")).toBe("subsystem-forge-moc");
    expect(subsystemShelfId("scout")).toBe("subsystem-scout-moc");
  });

  it("starts with SHELF_ID_PREFIX", () => {
    expect(subsystemShelfId("puls").startsWith(SHELF_ID_PREFIX)).toBe(true);
  });

  it("matches the vault's index/MOC entry-point regex", () => {
    expect(ENTRY_POINT_RE.test(subsystemShelfId("forge"))).toBe(true);
    expect(ENTRY_POINT_RE.test(subsystemShelfId("ledger"))).toBe(true);
  });
});

describe("shelfDailyLink", () => {
  it("builds an alias-form wikilink pointing at the shelf, labeled with the bare id", () => {
    expect(shelfDailyLink("forge")).toBe("[[subsystem-forge-moc|forge]]");
  });

  it("the link target matches subsystemShelfId (real graph edge)", () => {
    const link = shelfDailyLink("scout");
    expect(link).toContain(subsystemShelfId("scout"));
  });
});
