import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STATE_ORDER } from "../../stateTone";
import { AgentGlyph, AgentGlyphTestId } from "./AgentGlyph";

const SEEDS = ["Kevin", "Stuart", "Dave", "Otto", "Zibby"];

describe("AgentGlyph", () => {
  it("is deterministic — the same seed renders the same markup", () => {
    const { container: a } = render(<AgentGlyph seed="Kevin" state="working" />);
    const { container: b } = render(<AgentGlyph seed="Kevin" state="working" />);
    expect(a.innerHTML).toBe(b.innerHTML);
  });

  it("renders a different body for a different seed", () => {
    const { container: a } = render(<AgentGlyph seed="Kevin" state="idle" />);
    const { container: b } = render(<AgentGlyph seed="Stuart" state="idle" />);
    expect(a.innerHTML).not.toBe(b.innerHTML);
  });

  for (const seed of SEEDS) {
    for (const state of STATE_ORDER) {
      it(`renders seed="${seed}" state="${state}" as a crisp-edged 12x12 SVG`, () => {
        render(<AgentGlyph seed={seed} state={state} />);
        const svg = screen.getByTestId(AgentGlyphTestId.Root);
        expect(svg).toHaveAttribute("viewBox", "0 0 12 12");
        expect(svg).toHaveAttribute("shape-rendering", "crispEdges");
        expect(svg).toHaveAttribute("data-state", state);
        expect(svg).toHaveAttribute("data-seed", seed);
        // At least the mirrored body pixels + two eyes are always present.
        expect(svg.querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
      });
    }
  }

  it("sizes via width/height (sealed sizing, no raw px prop)", () => {
    render(<AgentGlyph seed="Kevin" size={128} state="idle" />);
    const svg = screen.getByTestId(AgentGlyphTestId.Root);
    expect(svg).toHaveAttribute("width", "128");
    expect(svg).toHaveAttribute("height", "128");
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

  // The eye group is always the LAST direct `<g>` child of the whole-body `<g>` —
  // it renders after the 0-or-2 arm groups, whose count varies per seed.
  function eyeGroupOf(container: HTMLElement) {
    const groups = container.querySelectorAll("svg > g > g");
    return groups[groups.length - 1] ?? null;
  }

  it("blinks idle/working/thinking but not blocked/error/done", () => {
    const { container: blinking } = render(<AgentGlyph seed="Kevin" state="thinking" />);
    expect(eyeGroupOf(blinking)?.getAttribute("style")).toContain("zb-blink");

    const { container: still } = render(<AgentGlyph seed="Kevin" state="blocked" />);
    expect(eyeGroupOf(still)?.getAttribute("style") ?? "").not.toContain("zb-blink");
  });

  it("tints the eyes with the state colour only when errored", () => {
    const { container: errored } = render(<AgentGlyph seed="Kevin" state="error" />);
    const errorEyes = eyeGroupOf(errored)?.querySelectorAll("rect") ?? [];
    expect(errorEyes.length).toBe(2);
    for (const eye of errorEyes) {
      expect((eye as SVGRectElement).style.fill).toBe("var(--color-state-err)");
    }

    const { container: idle } = render(<AgentGlyph seed="Kevin" state="idle" />);
    const idleEyes = eyeGroupOf(idle)?.querySelectorAll("rect") ?? [];
    expect(idleEyes.length).toBe(2);
    for (const eye of idleEyes) {
      expect((eye as SVGRectElement).style.fill).toBe("var(--color-panel)");
    }
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
