import { describe, expect, it } from "vitest";
import {
  CreateDepartmentInputSchema,
  DEPARTMENT_SEED,
  DepartmentIdSchema,
  DepartmentSchema,
  UpdateDepartmentInputSchema,
} from "./department.schema";

const minimal = {
  id: "pub",
  code: "PUB",
  name: "Publishing",
  tagline: "t",
  mandate: "m",
  color: "#112233",
};

describe("DepartmentIdSchema (open id, D-022)", () => {
  it("accepts the seed ids and pub", () => {
    for (const id of [...DEPARTMENT_SEED.map((d) => d.id), "pub"]) {
      expect(DepartmentIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it("rejects Dev, a, x/y", () => {
    for (const id of ["Dev", "a", "x/y"]) {
      expect(DepartmentIdSchema.safeParse(id).success).toBe(false);
    }
  });
});

describe("DepartmentSchema", () => {
  it("applies defaults for icon, fallback, tierDefault", () => {
    const parsed = DepartmentSchema.parse(minimal);
    expect(parsed).toMatchObject({ icon: "folder", fallback: "primary", tierDefault: null });
  });

  it("is strict", () => {
    expect(DepartmentSchema.safeParse({ ...minimal, extra: 1 }).success).toBe(false);
  });

  it("create input has no createdAt; update input has no id and is partial", () => {
    expect(CreateDepartmentInputSchema.safeParse({ ...minimal, createdAt: "x" }).success).toBe(
      false,
    );
    expect(UpdateDepartmentInputSchema.safeParse({ name: "New" }).success).toBe(true);
    expect(UpdateDepartmentInputSchema.safeParse({ id: "pub" }).success).toBe(false);
  });
});

describe("legacy division key", () => {
  it("is dropped on read", () => {
    const parsed = DepartmentSchema.parse({ ...minimal, division: "business" });
    expect((parsed as { division?: unknown }).division).toBeUndefined();
  });
});

describe("seeds", () => {
  it("parse, have 11 departments, only inc asks", () => {
    expect(DEPARTMENT_SEED).toHaveLength(11);
    for (const d of DEPARTMENT_SEED) expect(DepartmentSchema.safeParse(d).success).toBe(true);
    expect(DEPARTMENT_SEED.filter((d) => d.tierDefault !== null).map((d) => d.id)).toEqual(["inc"]);
  });
});
