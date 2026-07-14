import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SUBSYSTEMS,
  SubsystemIdSchema,
  SubsystemSchema,
  SubsystemWithStatusSchema,
  subsystemsContract,
} from "../index";

// This file lives at `libs/contracts/src/subsystems/`; the web app's public
// assets live at `apps/web/public/` — four levels up from here (subsystems →
// src → contracts → libs → repo root), then down into `apps/web/public`.
const PUBLIC_DIR = new URL("../../../../apps/web/public/", import.meta.url);

describe("subsystemsContract", () => {
  it("exposes GET /api/subsystems returning 200", () => {
    expect(subsystemsContract.getSubsystems.method).toBe("GET");
    expect(subsystemsContract.getSubsystems.path).toBe("/api/subsystems");
    expect(subsystemsContract.getSubsystems.responses).toHaveProperty("200");
  });

  it("exposes GET /api/subsystems/:id with 200 and 404", () => {
    expect(subsystemsContract.getSubsystem.method).toBe("GET");
    expect(subsystemsContract.getSubsystem.path).toBe("/api/subsystems/:id");
    expect(subsystemsContract.getSubsystem.responses).toHaveProperty("200");
    expect(subsystemsContract.getSubsystem.responses).toHaveProperty("404");
  });

  it("exposes POST /api/subsystems/:id/seen with 200 and 404", () => {
    expect(subsystemsContract.markSubsystemSeen.method).toBe("POST");
    expect(subsystemsContract.markSubsystemSeen.path).toBe("/api/subsystems/:id/seen");
    expect(subsystemsContract.markSubsystemSeen.responses).toHaveProperty("200");
    expect(subsystemsContract.markSubsystemSeen.responses).toHaveProperty("404");
  });
});

describe("SUBSYSTEMS registry", () => {
  it("has exactly 8 entries", () => {
    expect(SUBSYSTEMS).toHaveLength(8);
  });

  it("has unique ids covering the whole SubsystemIdSchema enum", () => {
    const ids = SUBSYSTEMS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(SubsystemIdSchema.options));
  });

  it("every entry is a valid Subsystem (name/tagline/mandate non-empty, color a hex triplet)", () => {
    for (const subsystem of SUBSYSTEMS) {
      expect(SubsystemSchema.safeParse(subsystem).success).toBe(true);
    }
  });

  it("Forge is the ZT accent blue #5b8def", () => {
    expect(SUBSYSTEMS.find((s) => s.id === "forge")?.color).toBe("#5b8def");
  });

  it("every heroImage points at the phase-90 art under /subsystems/", () => {
    for (const s of SUBSYSTEMS) {
      expect(s.heroImage).toBe(`/subsystems/${s.id}.jpg`);
    }
  });

  it("every heroImage resolves to a real file under apps/web/public (and its phase-103 webp sibling exists)", () => {
    for (const s of SUBSYSTEMS) {
      expect(s.heroImage).not.toBeNull();
      const relative = s.heroImage!.replace(/^\//, "");
      const jpgPath = new URL(relative, PUBLIC_DIR);
      expect(existsSync(jpgPath)).toBe(true);

      // Phase 103: the component derives a WebP sibling from this same jpg
      // path (extension swap) to serve via `image-set()` — the registry
      // string itself stays the jpg path, so guard the sibling separately.
      const webpPath = new URL(relative.replace(/\.jpg$/, ".webp"), PUBLIC_DIR);
      expect(existsSync(webpPath)).toBe(true);
    }
  });

  it("rejects a malformed color", () => {
    const bad = { ...SUBSYSTEMS[0], color: "orange" };
    expect(SubsystemSchema.safeParse(bad).success).toBe(false);
  });
});

describe("SubsystemWithStatusSchema", () => {
  it("accepts the phase-80 stub status", () => {
    const withStatus = { ...SUBSYSTEMS[0], state: "idle", tier2Count: 0, tier3Count: 0 };
    expect(SubsystemWithStatusSchema.safeParse(withStatus).success).toBe(true);
  });

  it("rejects an unknown state or a negative count", () => {
    const base = { ...SUBSYSTEMS[0], tier2Count: 0, tier3Count: 0 };
    expect(SubsystemWithStatusSchema.safeParse({ ...base, state: "weird" }).success).toBe(false);
    expect(
      SubsystemWithStatusSchema.safeParse({ ...base, state: "idle", tier2Count: -1 }).success,
    ).toBe(false);
  });

  it("rejects an unknown id shape (404-path case belongs at the route level)", () => {
    const withStatus = { ...SUBSYSTEMS[0], id: "nope", state: "idle", tier2Count: 0, tier3Count: 0 };
    expect(SubsystemWithStatusSchema.safeParse(withStatus).success).toBe(false);
  });
});
