import { SUBSYSTEMS } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { SubsystemNotFoundError } from "./subsystems.errors";
import { SubsystemsService } from "./subsystems.service";

describe("SubsystemsService", () => {
  it("lists all 8 subsystems in registry order, each with the phase-80 stub status", () => {
    const rows = new SubsystemsService().list();
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.id)).toEqual(SUBSYSTEMS.map((s) => s.id));
    expect(rows.every((r) => r.state === "klid")).toBe(true);
    expect(rows.every((r) => r.tier2Count === 0 && r.tier3Count === 0)).toBe(true);
  });

  it("returns a single subsystem by id with its identity fields intact", () => {
    const row = new SubsystemsService().get("forge");
    expect(row).toMatchObject({
      id: "forge",
      name: "Forge",
      color: "#f97316",
      state: "klid",
      tier2Count: 0,
      tier3Count: 0,
    });
  });

  it("throws SubsystemNotFoundError for an id outside the registry", () => {
    expect(() => new SubsystemsService().get("nope")).toThrow(SubsystemNotFoundError);
  });
});
