import { describe, expect, it } from "vitest";
import { DecompositionArtifactSchema } from "./decomposition-artifact.schema";

describe("DecompositionArtifactSchema", () => {
  it("accepts a well-formed list of entries with ordinal dependsOn", () => {
    const result = DecompositionArtifactSchema.safeParse([
      { name: "Add schema", description: "…", dependsOn: [] },
      { name: "Add endpoint", description: "…", dependsOn: [0] },
    ]);
    expect(result.success).toBe(true);
  });

  it("defaults description and dependsOn when absent", () => {
    const result = DecompositionArtifactSchema.safeParse([{ name: "Add schema" }]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]).toMatchObject({ description: "", dependsOn: [] });
    }
  });

  it("accepts an empty list (a decomposition that proposes no children)", () => {
    expect(DecompositionArtifactSchema.safeParse([]).success).toBe(true);
  });

  it("rejects an entry with no name", () => {
    expect(DecompositionArtifactSchema.safeParse([{ name: "" }]).success).toBe(false);
  });

  it("rejects a negative or non-integer dependsOn ordinal at the shape level", () => {
    expect(DecompositionArtifactSchema.safeParse([{ name: "x", dependsOn: [-1] }]).success).toBe(
      false,
    );
    expect(DecompositionArtifactSchema.safeParse([{ name: "x", dependsOn: [1.5] }]).success).toBe(
      false,
    );
  });

  it("rejects a non-array payload (an agent that replied with an object, not a list)", () => {
    expect(DecompositionArtifactSchema.safeParse({ name: "x" }).success).toBe(false);
  });

  it("caps the list at 200 entries", () => {
    const many = Array.from({ length: 201 }, (_, i) => ({ name: `item ${i}` }));
    expect(DecompositionArtifactSchema.safeParse(many).success).toBe(false);
  });
});
