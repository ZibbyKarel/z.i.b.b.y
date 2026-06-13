import { describe, expect, it } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import type { TaskRouting } from "../task";
import { PlanPreview } from "./PlanPreview";

const SINGLE: TaskRouting = {
  target: { kind: "agent", id: "koder", name: "Kodér", glyph: "bot" },
  confidence: 0.8,
  reason: "single reason",
  matchedTerms: [],
  candidates: [{ kind: "agent", id: "koder", name: "Kodér", glyph: "bot" }],
  mode: "single",
  proposedGoal: null,
  paths: [],
};

const LOOP: TaskRouting = {
  target: { kind: "pipeline", id: "delivery", name: "Delivery", glyph: "flow" },
  confidence: 0.85,
  reason: "loop reason",
  matchedTerms: [],
  candidates: [{ kind: "pipeline", id: "delivery", name: "Delivery", glyph: "flow" }],
  mode: "loop",
  proposedGoal: {
    objective: "keep going until green",
    maker: { kind: "pipeline", id: "delivery" },
    verifier: { kind: "checks" },
    maxIterations: 6,
    instructions: "keep going until green",
  },
  paths: [],
};

describe("PlanPreview", () => {
  it("renders a single verdict as one dispatch to the routed target", () => {
    render(<PlanPreview routing={SINGLE} />);
    expect(screen.getByText(/ZIBBY to předá/)).toBeInTheDocument();
    expect(screen.getByText(/single reason/)).toBeInTheDocument();
  });

  it("renders a loop verdict with maker + checks verifier + iteration cap", () => {
    render(<PlanPreview routing={LOOP} />);
    expect(screen.getByText(/Loop · vykonavatel Delivery/)).toBeInTheDocument();
    expect(screen.getByText(/až 6 iterací/)).toBeInTheDocument();
  });

  it("flags a low-confidence single verdict", () => {
    render(<PlanPreview routing={{ ...SINGLE, confidence: 0.2 }} />);
    expect(screen.getByText(/nízká jistota/)).toBeInTheDocument();
  });
});
