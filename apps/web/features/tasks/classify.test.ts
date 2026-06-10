import { describe, expect, it } from "vitest";
import type { Agent } from "@zibby/contracts";
import type { Pipeline } from "../../domain";
import { classifyTask } from "./classify";
import { confidenceBand, extractPaths } from "./task";

const agents: Agent[] = [
  {
    id: "curator",
    name: "Kurátor",
    glyph: "film",
    category: "Média",
    description: "Třídí a popisuje média v knihovně",
    instructions: "",
  },
  {
    id: "coder",
    name: "Kodér",
    glyph: "code",
    category: "Vývoj",
    description: "Implementuje podle design.md v izolované branchi",
    instructions: "",
  },
];

const pipelines: Pipeline[] = [
  {
    id: "build-feature",
    name: "Build Feature",
    budget: 25,
    lastRun: "—",
    lastState: "done",
    desc: "Spec, implementace, testy a docs se zpětnou smyčkou",
    file: "~/zibby/pipelines/build-feature.pipeline.md",
    phases: [],
  },
];

describe("extractPaths", () => {
  it("detects ~, ./ and absolute paths and de-duplicates", () => {
    const text = "ulož do ~/zibby/memory/x.md a načti ~/zibby/memory/x.md plus /var/log/app";
    expect(extractPaths(text)).toEqual(["~/zibby/memory/x.md", "/var/log/app"]);
  });

  it("ignores prose without paths", () => {
    expect(extractPaths("zkontroluj zálohy")).toEqual([]);
  });
});

describe("classifyTask", () => {
  it("routes to the agent whose catalog terms match the description", () => {
    const r = classifyTask("Srovnej a popiš média v knihovně", [], agents, pipelines);
    expect(r.target.id).toBe("curator");
    expect(r.matchedTerms.length).toBeGreaterThan(0);
    expect(confidenceBand(r.confidence)).not.toBe("low");
  });

  it("uses path hints as routing signal", () => {
    const r = classifyTask("srovnej to", ["~/Projects/media-vault"], agents, pipelines);
    expect(r.target.id).toBe("curator");
  });

  it("returns every candidate for manual override", () => {
    const r = classifyTask("cokoliv", [], agents, pipelines);
    expect(r.candidates).toHaveLength(3);
    expect(r.candidates.some((c) => c.kind === "pipeline")).toBe(true);
  });

  it("flags low confidence when nothing matches", () => {
    const r = classifyTask("xyzzy", [], agents, pipelines);
    expect(confidenceBand(r.confidence)).toBe("low");
  });

  it("falls back to ZIBBY when the catalog is empty", () => {
    const r = classifyTask("anything", [], [], []);
    expect(r.target.id).toBe("zibby");
    expect(r.candidates).toHaveLength(1);
  });

  it("is deterministic for the same input", () => {
    const a = classifyTask("Implementuj podle design.md", [], agents, pipelines);
    const b = classifyTask("Implementuj podle design.md", [], agents, pipelines);
    expect(a).toEqual(b);
    expect(a.target.id).toBe("coder");
  });
});
