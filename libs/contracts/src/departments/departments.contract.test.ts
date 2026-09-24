import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EmptyBodySchema } from "../common.schema";
import {
  DEPARTMENTS,
  DepartmentIdSchema,
  DepartmentSchema,
  DepartmentWithStatusSchema,
  departmentsContract,
} from "../index";

// This file lives at `libs/contracts/src/departments/`; the web app's public
// assets live at `apps/web/public/` — four levels up from here (departments →
// src → contracts → libs → repo root), then down into `apps/web/public`.
const PUBLIC_DIR = new URL("../../../../apps/web/public/", import.meta.url);

describe("departmentsContract", () => {
  it("exposes GET /api/departments returning 200", () => {
    expect(departmentsContract.getDepartments.method).toBe("GET");
    expect(departmentsContract.getDepartments.path).toBe("/api/departments");
    expect(departmentsContract.getDepartments.responses).toHaveProperty("200");
  });

  it("exposes GET /api/departments/:id with 200 and 404", () => {
    expect(departmentsContract.getDepartment.method).toBe("GET");
    expect(departmentsContract.getDepartment.path).toBe("/api/departments/:id");
    expect(departmentsContract.getDepartment.responses).toHaveProperty("200");
    expect(departmentsContract.getDepartment.responses).toHaveProperty("404");
  });

  it("exposes POST /api/departments/:id/seen with 200 and 404", () => {
    expect(departmentsContract.markDepartmentSeen.method).toBe("POST");
    expect(departmentsContract.markDepartmentSeen.path).toBe("/api/departments/:id/seen");
    expect(departmentsContract.markDepartmentSeen.responses).toHaveProperty("200");
    expect(departmentsContract.markDepartmentSeen.responses).toHaveProperty("404");
  });

  it("markDepartmentSeen's empty body IS the shared EmptyBodySchema (T11 dedup, finding #37)", () => {
    expect(departmentsContract.markDepartmentSeen.body).toBe(EmptyBodySchema);
  });

  it("NS2 F1b: exposes GET /api/departments/unowned returning 200", () => {
    expect(departmentsContract.listUnownedEntities.method).toBe("GET");
    expect(departmentsContract.listUnownedEntities.path).toBe("/api/departments/unowned");
    expect(departmentsContract.listUnownedEntities.responses).toHaveProperty("200");
  });

  it("NS2 F1c: exposes GET /api/departments/:id/roster with 200 and 404", () => {
    expect(departmentsContract.getRoster.method).toBe("GET");
    expect(departmentsContract.getRoster.path).toBe("/api/departments/:id/roster");
    expect(departmentsContract.getRoster.responses).toHaveProperty("200");
    expect(departmentsContract.getRoster.responses).toHaveProperty("404");
  });
});

describe("DEPARTMENTS registry", () => {
  it("has exactly 11 entries", () => {
    expect(DEPARTMENTS).toHaveLength(11);
  });

  it("contains knowledge, finance and personal with non-empty tagline/mandate", () => {
    for (const id of ["knw", "fin", "per"] as const) {
      const department = DEPARTMENTS.find((s) => s.id === id);
      expect(department).toBeDefined();
      expect(department?.tagline.length).toBeGreaterThan(0);
      expect(department?.mandate.length).toBeGreaterThan(0);
    }
  });

  it("has 11 unique colors", () => {
    const colors = DEPARTMENTS.map((s) => s.color);
    expect(new Set(colors).size).toBe(11);
  });

  it("personal's color matches the shared hex regex", () => {
    const personal = DEPARTMENTS.find((s) => s.id === "per");
    expect(personal?.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("has unique ids covering the whole DepartmentIdSchema enum", () => {
    const ids = DEPARTMENTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(DepartmentIdSchema.options));
  });

  it("every entry is a valid Department (name/tagline/mandate non-empty, color a hex triplet)", () => {
    for (const department of DEPARTMENTS) {
      expect(DepartmentSchema.safeParse(department).success).toBe(true);
    }
  });

  it("Dev is the ZT accent blue #5b8def", () => {
    expect(DEPARTMENTS.find((s) => s.id === "dev")?.color).toBe("#5b8def");
  });

  it("carries no portrait — a department's identity is its color and its orb", () => {
    for (const s of DEPARTMENTS) {
      expect(s).not.toHaveProperty("heroImage");
    }
  });

  it("leaves no orphaned hero art behind under apps/web/public", () => {
    // The inverse of the phase-90/103 guard this replaces: that one pinned the
    // art into existence, this one pins it OUT. The Velín-D header settles
    // identity on the live orb, so a portrait reappearing here would be a
    // second, competing identity mark — and dead weight in the bundle, since
    // nothing reads it anymore.
    expect(existsSync(new URL("departments/", PUBLIC_DIR))).toBe(false);
  });

  it("rejects a malformed color", () => {
    const bad = { ...DEPARTMENTS[0], color: "orange" };
    expect(DepartmentSchema.safeParse(bad).success).toBe(false);
  });
});

describe("DepartmentWithStatusSchema", () => {
  it("accepts the phase-80 stub status", () => {
    const withStatus = {
      ...DEPARTMENTS[0],
      state: "idle",
      tier2Count: 0,
      tier3Count: 0,
      errorCount: 0,
    };
    expect(DepartmentWithStatusSchema.safeParse(withStatus).success).toBe(true);
  });

  it("rejects an unknown state or a negative count", () => {
    const base = { ...DEPARTMENTS[0], tier2Count: 0, tier3Count: 0, errorCount: 0 };
    expect(DepartmentWithStatusSchema.safeParse({ ...base, state: "weird" }).success).toBe(false);
    expect(
      DepartmentWithStatusSchema.safeParse({ ...base, state: "idle", tier2Count: -1 }).success,
    ).toBe(false);
  });

  it("rejects an unknown id shape (404-path case belongs at the route level)", () => {
    const withStatus = {
      ...DEPARTMENTS[0],
      id: "nope",
      state: "idle",
      tier2Count: 0,
      tier3Count: 0,
    };
    expect(DepartmentWithStatusSchema.safeParse(withStatus).success).toBe(false);
  });
});
