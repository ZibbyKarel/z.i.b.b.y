import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STATE_ORDER } from "../../stateTone";
import { MinionFigure, MinionFigureTestId } from "./MinionFigure";
import { MinionScene, MinionSceneTestId } from "./MinionScene";
import { MinionWalker, MinionWalkerTestId } from "./MinionWalker";
import {
  MINION_HAIRS,
  MINION_HEIGHTS,
  MINION_WIDTHS,
  ZIBBY_APPEARANCE,
  minionAppearanceFromSeed,
} from "./minionAppearance";

const KEVIN = minionAppearanceFromSeed("Kevin");

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("minionAppearanceFromSeed", () => {
  it("is deterministic", () => {
    expect(minionAppearanceFromSeed("Kevin")).toEqual(minionAppearanceFromSeed("Kevin"));
  });

  it("only produces values from the sanctioned sets, with no hat or tie", () => {
    for (const seed of ["a", "Kevin", "Stuart", "Zibby", "Karel Zíbar", "x".repeat(40)]) {
      const a = minionAppearanceFromSeed(seed);
      expect(MINION_WIDTHS).toContain(a.width);
      expect(MINION_HEIGHTS).toContain(a.height);
      expect(MINION_HAIRS).toContain(a.hair);
      expect([1, 2]).toContain(a.eyes);
      expect([0, 1, 2]).toContain(a.skin);
      expect(a.hat).toBeUndefined();
      expect(a.tie).toBeUndefined();
    }
  });

  it("varies between seeds", () => {
    const seen = new Set(
      ["Kevin", "Stuart", "Dave", "Otto", "Pepa", "Lenka", "Mel", "Ken"].map((s) =>
        JSON.stringify(minionAppearanceFromSeed(s)),
      ),
    );
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe("MinionFigure", () => {
  for (const state of STATE_ORDER) {
    it(`renders state="${state}"`, () => {
      render(<MinionFigure appearance={KEVIN} state={state} />);
      const svg = screen.getByTestId(MinionFigureTestId.Root);
      expect(svg).toHaveAttribute("data-state", state);
      expect(svg).toHaveAttribute("viewBox", "0 0 100 120");
      expect(svg).toHaveAttribute("aria-hidden", "true");
    });
  }

  it("sizes width from height by 100:120", () => {
    render(<MinionFigure appearance={KEVIN} size={128} />);
    const svg = screen.getByTestId(MinionFigureTestId.Root);
    expect(svg).toHaveAttribute("height", "128");
    expect(svg).toHaveAttribute("width", "107");
  });

  it("is an img with a label", () => {
    render(<MinionFigure appearance={KEVIN} label="Kevin" />);
    const svg = screen.getByTestId(MinionFigureTestId.Root);
    expect(svg).toHaveRole("img");
    expect(svg).toHaveAccessibleName("Kevin");
  });

  it("draws the Zibby moustache and glow lens only when asked", () => {
    const { unmount } = render(<MinionFigure appearance={ZIBBY_APPEARANCE} state="idle" />);
    const plain = screen.getByTestId(MinionFigureTestId.Root).innerHTML;
    unmount();
    render(<MinionFigure lens stache appearance={ZIBBY_APPEARANCE} state="idle" />);
    const zibby = screen.getByTestId(MinionFigureTestId.Root).innerHTML;
    expect(zibby.length).toBeGreaterThan(plain.length);
  });

  it("gives each instance its own clip-path id", () => {
    render(
      <>
        <MinionFigure appearance={KEVIN} state="idle" />
        <MinionFigure appearance={KEVIN} state="idle" />
      </>,
    );
    const ids = screen
      .getAllByTestId(MinionFigureTestId.Root)
      .map((s) => s.querySelector("clipPath")?.id);
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("MinionScene", () => {
  for (const state of STATE_ORDER) {
    it(`renders state="${state}" with SMIL animation`, () => {
      render(<MinionScene appearance={KEVIN} state={state} />);
      const svg = screen.getByTestId(MinionSceneTestId.Root);
      expect(svg).toHaveAttribute("data-state", state);
      expect(svg).toHaveAttribute("viewBox", "0 0 160 120");
      expect(svg.querySelectorAll("animate, animateTransform").length).toBeGreaterThan(0);
    });
  }

  it("turns the phase into the SMIL begin", () => {
    render(<MinionScene appearance={KEVIN} phase={1.5} state="working" />);
    const begins = Array.from(
      screen.getByTestId(MinionSceneTestId.Root).querySelectorAll("[begin]"),
    ).map((n) => n.getAttribute("begin"));
    expect(begins).toContain("1.5s");
  });

  it("remounts the scene when the state changes", () => {
    const { rerender } = render(<MinionScene appearance={KEVIN} state="working" />);
    const before = screen.getByTestId(MinionSceneTestId.Root).innerHTML;
    rerender(<MinionScene appearance={KEVIN} state="done" />);
    expect(screen.getByTestId(MinionSceneTestId.Root).innerHTML).not.toBe(before);
  });

  it("omits the floor line with ground={false}", () => {
    const { unmount } = render(<MinionScene appearance={KEVIN} state="idle" />);
    expect(
      screen.getByTestId(MinionSceneTestId.Root).querySelectorAll("line").length,
    ).toBeGreaterThan(0);
    unmount();
    render(<MinionScene appearance={KEVIN} ground={false} state="idle" />);
    const lines = Array.from(
      screen.getByTestId(MinionSceneTestId.Root).querySelectorAll("line"),
    ).filter((l) => l.getAttribute("y1") === "110.5");
    expect(lines).toHaveLength(0);
  });

  it("renders a static figure (no SMIL) under reduced motion", async () => {
    mockReducedMotion(true);
    await act(async () => {
      render(<MinionScene appearance={KEVIN} state="working" />);
    });
    const svg = screen.getByTestId(MinionSceneTestId.Root);
    expect(svg).toHaveAttribute("data-state", "working");
    expect(svg.querySelectorAll("animate, animateTransform")).toHaveLength(0);
  });
});

describe("MinionWalker", () => {
  it("marches (SMIL) when empty-handed and carrying", () => {
    const { unmount } = render(<MinionWalker appearance={KEVIN} />);
    let svg = screen.getByTestId(MinionWalkerTestId.Root);
    expect(svg).toHaveAttribute("data-state", "working");
    expect(svg).toHaveAttribute("data-carry", "false");
    expect(svg.querySelectorAll("animateTransform").length).toBeGreaterThan(0);
    unmount();
    render(<MinionWalker carry appearance={KEVIN} />);
    svg = screen.getByTestId(MinionWalkerTestId.Root);
    expect(svg).toHaveAttribute("data-carry", "true");
    expect(svg.querySelectorAll("animateTransform").length).toBeGreaterThan(0);
  });

  it("stands still under reduced motion", async () => {
    mockReducedMotion(true);
    await act(async () => {
      render(<MinionWalker carry appearance={KEVIN} />);
    });
    expect(
      screen.getByTestId(MinionWalkerTestId.Root).querySelectorAll("animateTransform"),
    ).toHaveLength(0);
  });
});
