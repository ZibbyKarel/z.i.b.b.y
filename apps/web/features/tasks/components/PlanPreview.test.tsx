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

  // NS2 F10 — the interactive surface for an ambiguous verdict. No gate here: the
  // preview + manual picker IS the operator's intervention on this screen.
  describe("ambiguous verdict (NS2 F10)", () => {
    const AMBIGUOUS: TaskRouting = {
      ...SINGLE,
      confidence: 0.55,
      ambiguous: true,
      runnerUp: {
        target: { kind: "agent", id: "reviewer", name: "Reviewer", glyph: "bot" },
        confidence: 0.5,
        reason: "also plausible",
      },
    };

    it("names BOTH candidates so the operator sees the real choice", () => {
      render(<PlanPreview routing={AMBIGUOUS} />);
      expect(screen.getByText(/nerozhodnuto/)).toBeInTheDocument();
      expect(screen.getByText(/Kodér, nebo Reviewer\?/)).toBeInTheDocument();
    });

    it("still shows the best available pick — ambiguity is advice, not a missing answer", () => {
      render(<PlanPreview routing={AMBIGUOUS} />);
      expect(screen.getByText(/ZIBBY to předá/)).toBeInTheDocument();
    });

    it("uses the nothing-fits phrasing when no runner-up was named", () => {
      render(<PlanPreview routing={{ ...AMBIGUOUS, runnerUp: null }} />);
      expect(screen.getByText(/Nic sem jasně nepasuje/)).toBeInTheDocument();
    });

    it("replaces the low-confidence tag rather than stacking a second warning", () => {
      // Both conditions true at once: `ambiguous` and a confidence inside the low band.
      render(<PlanPreview routing={{ ...AMBIGUOUS, confidence: 0.2 }} />);
      expect(screen.getByText(/nerozhodnuto/)).toBeInTheDocument();
      expect(screen.queryByText(/nízká jistota/)).not.toBeInTheDocument();
    });
  });
});
