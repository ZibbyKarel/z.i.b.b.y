import { describe, expect, it } from "vitest";
import { extractDecompositionArtifact } from "./decomposition-artifact";

describe("extractDecompositionArtifact", () => {
  it("parses a minified JSON array that is the whole log", () => {
    const log = '[{"name":"Add schema","description":"…","dependsOn":[]}]';
    const artifact = extractDecompositionArtifact(log);
    expect(artifact).toEqual([{ name: "Add schema", description: "…", dependsOn: [] }]);
  });

  it("parses a pretty-printed JSON array preceded by reasoning text", () => {
    const log = [
      "Let me look at the epic first.",
      "Here is my decomposition:",
      "[",
      '  { "name": "Add schema", "dependsOn": [] },',
      '  { "name": "Add endpoint", "dependsOn": [0] }',
      "]",
    ].join("\n");
    const artifact = extractDecompositionArtifact(log);
    expect(artifact).toHaveLength(2);
    expect(artifact?.[1]).toMatchObject({ name: "Add endpoint", dependsOn: [0] });
  });

  it("prefers the LAST top-level array when the log contains more than one", () => {
    const log = [
      "some earlier tool output: [1, 2, 3]",
      '[{"name":"Real answer","dependsOn":[]}]',
    ].join("\n");
    const artifact = extractDecompositionArtifact(log);
    expect(artifact).toEqual([{ name: "Real answer", description: "", dependsOn: [] }]);
  });

  it("ignores brackets inside quoted strings when finding the span", () => {
    const log = '[{"name":"Handle [edge] cases","dependsOn":[]}]';
    const artifact = extractDecompositionArtifact(log);
    expect(artifact?.[0]?.name).toBe("Handle [edge] cases");
  });

  it("tolerates a markdown code fence around the array", () => {
    const log = '```json\n[{"name":"Add schema","dependsOn":[]}]\n```';
    const artifact = extractDecompositionArtifact(log);
    expect(artifact).toEqual([{ name: "Add schema", description: "", dependsOn: [] }]);
  });

  it("returns null when the log has no JSON array at all", () => {
    expect(extractDecompositionArtifact("I could not decompose this epic.")).toBeNull();
  });

  it("returns null on malformed JSON (unbalanced quotes) rather than throwing", () => {
    expect(() => extractDecompositionArtifact('[{"name": "broke]')).not.toThrow();
    expect(extractDecompositionArtifact('[{"name": "broke]')).toBeNull();
  });

  it("returns null when the array parses but fails schema validation", () => {
    expect(extractDecompositionArtifact('[{"name": ""}]')).toBeNull();
  });

  it("returns null on empty input", () => {
    expect(extractDecompositionArtifact("")).toBeNull();
  });

  it("never throws on an absurdly large log (bounded scan)", () => {
    const huge = "x".repeat(500_000) + '[{"name":"tail item","dependsOn":[]}]';
    expect(() => extractDecompositionArtifact(huge)).not.toThrow();
    expect(extractDecompositionArtifact(huge)).toEqual([
      { name: "tail item", description: "", dependsOn: [] },
    ]);
  });
});
