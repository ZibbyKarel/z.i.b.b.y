import { describe, expect, it } from "vitest";
import { RegistryBindingsSchema, registriesContract } from "../index";

describe("registriesContract", () => {
  it("exposes a GET /api/registries/bindings route returning 200", () => {
    expect(registriesContract.getRegistryBindings.method).toBe("GET");
    expect(registriesContract.getRegistryBindings.path).toBe("/api/registries/bindings");
    expect(registriesContract.getRegistryBindings.responses).toHaveProperty("200");
  });
});

describe("RegistryBindingsSchema", () => {
  it("accepts a well-formed payload with per-id department lists", () => {
    const parsed = RegistryBindingsSchema.safeParse({
      skills: { "code-review": ["dev", "qa"] },
      mcp: { github: ["dev"] },
      hooks: {},
      commands: { orchestrate: [] },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown department id", () => {
    const parsed = RegistryBindingsSchema.safeParse({
      skills: { x: ["not-a-department"] },
      mcp: {},
      hooks: {},
      commands: {},
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing kind", () => {
    const parsed = RegistryBindingsSchema.safeParse({ skills: {}, mcp: {}, hooks: {} });
    expect(parsed.success).toBe(false);
  });
});
