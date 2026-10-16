import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STATE_ORDER } from "../../stateTone";
import { MinionFigureTestId } from "../Minion/MinionFigure";
import { ZIBBY_APPEARANCE } from "../Minion/minionAppearance";
import { AgentGlyph, AgentGlyphTestId } from "./AgentGlyph";

const SEEDS = ["Kevin", "Stuart", "Dave", "Otto", "Zibby"];

/** `useId`-based clip ids differ per render; normalise them before comparing markup. */
const stable = (html: string) => html.replace(/minion-clip-[^")]+/g, "clip");

describe("AgentGlyph", () => {
  it("is deterministic — the same seed renders the same markup", () => {
    const { container: a } = render(<AgentGlyph seed="Kevin" state="working" />);
    const { container: b } = render(<AgentGlyph seed="Kevin" state="working" />);
    expect(stable(a.innerHTML)).toBe(stable(b.innerHTML));
  });

  it("renders a different minion for a different seed", () => {
    const { container: a } = render(<AgentGlyph seed="Kevin" state="idle" />);
    const { container: b } = render(<AgentGlyph seed="Stuart" state="idle" />);
    expect(stable(a.innerHTML).replace(/data-seed="\w+"/, "")).not.toBe(
      stable(b.innerHTML).replace(/data-seed="\w+"/, ""),
    );
  });

  it("an explicit appearance overrides the seed-derived one", () => {
    const { container: a } = render(<AgentGlyph seed="Kevin" state="idle" />);
    const { container: b } = render(
      <AgentGlyph appearance={ZIBBY_APPEARANCE} seed="Kevin" state="idle" />,
    );
    expect(stable(a.innerHTML)).not.toBe(stable(b.innerHTML));
  });

  for (const seed of SEEDS) {
    for (const state of STATE_ORDER) {
      it(`renders seed="${seed}" state="${state}" as a 100x120 minion SVG`, () => {
        render(<AgentGlyph seed={seed} state={state} />);
        const svg = screen.getByTestId(AgentGlyphTestId.Root);
        expect(svg).toHaveAttribute("viewBox", "0 0 100 120");
        expect(svg).toHaveAttribute("data-state", state);
        expect(svg).toHaveAttribute("data-seed", seed);
        expect(svg.querySelectorAll("path, circle, rect").length).toBeGreaterThan(5);
      });
    }
  }

  it("sizes via height and the 100:120 aspect width (sealed sizing)", () => {
    render(<AgentGlyph seed="Kevin" size={128} state="idle" />);
    const svg = screen.getByTestId(AgentGlyphTestId.Root);
    expect(svg).toHaveAttribute("height", "128");
    expect(svg).toHaveAttribute("width", "107");
  });

  it("does not render the standalone figure root (the glyph owns its svg)", () => {
    render(<AgentGlyph seed="Kevin" state="idle" />);
    expect(screen.queryByTestId(MinionFigureTestId.Root)).toBeNull();
  });

  it("glows only when live, size >= 40 and glow is on", () => {
    const { container: small } = render(<AgentGlyph glow seed="Kevin" size={22} state="working" />);
    expect(small.querySelector("svg")?.style.filter).toBe("none");

    const { container: idle } = render(<AgentGlyph glow seed="Kevin" size={48} state="idle" />);
    expect(idle.querySelector("svg")?.style.filter).toBe("none");

    const { container: off } = render(
      <AgentGlyph glow={false} seed="Kevin" size={48} state="working" />,
    );
    expect(off.querySelector("svg")?.style.filter).toBe("none");

    const { container: on } = render(<AgentGlyph glow seed="Kevin" size={48} state="working" />);
    const svg = on.querySelector("svg");
    expect(svg?.style.filter).toBe("var(--glyph-glow-filter, none)");
    expect(svg?.style.getPropertyValue("--glyph-glow-color")).toContain(
      "color-mix(in oklch, var(--color-state-work) 75%, transparent)",
    );
  });

  it("forwards a ref to the root svg", () => {
    let node: SVGSVGElement | null = null;
    render(
      <AgentGlyph
        ref={(el) => {
          node = el;
        }}
        seed="Kevin"
        state="idle"
      />,
    );
    expect(node).toBeInstanceOf(SVGSVGElement);
  });
});
