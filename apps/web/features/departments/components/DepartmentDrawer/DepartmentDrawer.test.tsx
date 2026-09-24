import { DEPARTMENTS, type DepartmentWithStatus } from "@zibby/contracts";
import { Dialog } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderWithProviders, screen } from "../../../../test/render";
import {
  DepartmentDrawer,
  DepartmentDrawerTestId,
  PANEL_EXIT_MS,
  backdropStyle,
  headerBandStyle,
  panelTransitionStyle,
  stateDotStyle,
  statePillStyle,
} from "./DepartmentDrawer";

const markSeenMutate = vi.fn();

vi.mock("../../mutations/useMarkDepartmentSeenMutation", () => ({
  useMarkDepartmentSeenMutation: () => ({ mutate: markSeenMutate, isPending: false }),
}));

// The drawer's own suite covers chrome (header, tabs, focus, escape) — each
// tab's own real behavior gets its own full coverage in its own test file
// (`RosterTab.test.tsx` / `AktivitaTab.test.tsx` / `GatesTab.test.tsx` /
// `ArtefaktyTab.test.tsx`), so all four are stubbed here to keep this file's
// mocks focused on what it actually exercises.
vi.mock("./RosterTab", () => ({
  RosterTab: ({ department }: { department: { id: string } }) => (
    <div data-testid="roster-tab-stub">{department.id}</div>
  ),
}));
vi.mock("./AktivitaTab", () => ({
  AktivitaTab: ({ department }: { department: { id: string } }) => (
    <div data-testid="aktivita-tab-stub">{department.id}</div>
  ),
}));
vi.mock("./GatesTab", () => ({
  GatesTab: ({ department }: { department: { id: string } }) => (
    <div data-testid="gates-tab-stub">{department.id}</div>
  ),
}));
vi.mock("./HandoffTab", () => ({
  HandoffTab: ({ department }: { department: { id: string } }) => (
    <div data-testid="handoff-tab-stub">{department.id}</div>
  ),
}));
vi.mock("./ArtefaktyTab", () => ({
  ArtefaktyTab: ({ department }: { department: { id: string } }) => (
    <div data-testid="artefakty-tab-stub">{department.id}</div>
  ),
}));

function fixture(overrides: Partial<DepartmentWithStatus> = {}): DepartmentWithStatus {
  const base = DEPARTMENTS[0]!;
  return {
    id: base.id,
    code: base.code,
    name: base.name,
    tagline: base.tagline,
    mandate: base.mandate,
    color: base.color,
    state: "idle",
    tier2Count: 0,
    tier3Count: 0,
    errorCount: 0,
    ...overrides,
  };
}

describe("DepartmentDrawer (Phase 84)", () => {
  beforeEach(() => {
    markSeenMutate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the panel and header identity", () => {
    renderWithProviders(<DepartmentDrawer department={fixture()} onClose={vi.fn()} />);

    expect(screen.getByTestId(DepartmentDrawerTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(DepartmentDrawerTestId.Panel)).toBeInTheDocument();
    expect(screen.getByTestId(DepartmentDrawerTestId.Name)).toHaveTextContent(DEPARTMENTS[0]!.name);
    // Velín-D folds the mandate and the epithet onto one line.
    const mandate = screen.getByTestId(DepartmentDrawerTestId.Mandate);
    expect(mandate).toHaveTextContent(DEPARTMENTS[0]!.mandate);
    expect(mandate).toHaveTextContent(DEPARTMENTS[0]!.tagline);
  });

  // The header's identity mark is the orb + the department's own glyph. The DS
  // `Icon` renders its paths with no name attribute, so WHICH glyph landed
  // isn't observable here — `departmentVisuals.test.ts` pins the id→glyph table
  // itself (the thing that could actually drift); this only pins that the
  // header renders the mark at all, rather than the old generic `bot` tile.
  it("renders the identity glyph over the orb", () => {
    renderWithProviders(<DepartmentDrawer department={fixture({ id: "sec" })} onClose={vi.fn()} />);
    expect(screen.getByTestId(DepartmentDrawerTestId.Glyph).querySelector("svg")).not.toBeNull();
  });

  it.each([
    ["idle", {}, "V klidu"],
    ["running", {}, "Běží"],
    ["report", { tier2Count: 3 }, "Hlášení připraveno"],
    ["waiting", { tier3Count: 2 }, "Čeká na rozhodnutí"],
    ["error", { errorCount: 1 }, "Chyba"],
  ] as const)("renders the header status for state %s", (state, extra, label) => {
    renderWithProviders(
      <DepartmentDrawer department={fixture({ state, ...extra })} onClose={vi.fn()} />,
    );
    const status = screen.getByTestId(DepartmentDrawerTestId.Status);
    expect(status).toHaveTextContent(label);
  });

  it("shows the Tier-2/Tier-3 count badge only for report/waiting", () => {
    const { unmount } = renderWithProviders(
      <DepartmentDrawer
        department={fixture({ state: "report", tier2Count: 4 })}
        onClose={vi.fn()}
      />,
    );
    // Shows the bare numeral (the pill beside it already says the state), but
    // still announces the full phrase.
    const count = screen.getByTestId(DepartmentDrawerTestId.Count);
    expect(count).toHaveTextContent("4");
    expect(count).toHaveAccessibleName("4 hlášení k nahlédnutí");
    unmount();

    // idle/running have nothing outstanding to count — the state pill alone.
    renderWithProviders(<DepartmentDrawer department={fixture()} onClose={vi.fn()} />);
    expect(screen.queryByTestId(DepartmentDrawerTestId.Count)).toBeNull();
  });

  it("shows the error count badge for the error state", () => {
    renderWithProviders(
      <DepartmentDrawer
        department={fixture({ state: "error", errorCount: 2 })}
        onClose={vi.fn()}
      />,
    );
    const count = screen.getByTestId(DepartmentDrawerTestId.Count);
    expect(count).toHaveTextContent("2");
    expect(count).toHaveAccessibleName("2 chyb");
  });

  it("fires markDepartmentSeen exactly once per open — not again on a re-render with the same department", () => {
    const { rerender } = renderWithProviders(
      <DepartmentDrawer department={fixture()} onClose={vi.fn()} />,
    );
    expect(markSeenMutate).toHaveBeenCalledTimes(1);
    expect(markSeenMutate).toHaveBeenCalledWith({ params: { id: fixture().id }, body: {} });

    // A re-render with a FRESH object for the SAME id (e.g. the polled query
    // handing down a new reference) must not refire.
    rerender(<DepartmentDrawer department={fixture({ tier2Count: 1 })} onClose={vi.fn()} />);
    expect(markSeenMutate).toHaveBeenCalledTimes(1);
  });

  it("fires markDepartmentSeen again when the selection swaps to a different department", () => {
    const { rerender } = renderWithProviders(
      <DepartmentDrawer department={fixture({ id: "dev" })} onClose={vi.fn()} />,
    );
    expect(markSeenMutate).toHaveBeenCalledTimes(1);

    rerender(<DepartmentDrawer department={fixture({ id: "ops" })} onClose={vi.fn()} />);
    expect(markSeenMutate).toHaveBeenCalledTimes(2);
    expect(markSeenMutate).toHaveBeenLastCalledWith({ params: { id: "ops" }, body: {} });
  });

  it("closes via the header close button after the exit transition", () => {
    // `fireEvent`, not `userEvent`, under fake timers: `userEvent`'s async click
    // awaits React's async `act()` flush, which never resolves once
    // `vi.useFakeTimers()` is active in this RTL/React 19 setup — the same
    // reason every other fake-timer test in this codebase
    // (`StatusPill.hoverRace.test.tsx`) uses `fireEvent`, not `userEvent`.
    vi.useFakeTimers();
    const onClose = vi.fn();
    renderWithProviders(<DepartmentDrawer department={fixture()} onClose={onClose} />);

    fireEvent.click(screen.getByTestId(DepartmentDrawerTestId.Close));
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(PANEL_EXIT_MS);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the glyph overlay non-interactive so it can't swallow a click", () => {
    renderWithProviders(<DepartmentDrawer department={fixture()} onClose={vi.fn()} />);

    // The glyph sits ON TOP of the orb; it must never eat pointer events.
    // (The close button no longer needs this guard — Velín-D puts it in the
    // header's own flex row rather than floating it over the art.)
    expect(screen.getByTestId(DepartmentDrawerTestId.Glyph)).toHaveStyle({
      pointerEvents: "none",
    });
  });

  it("closes on Escape after the exit transition", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    renderWithProviders(<DepartmentDrawer department={fixture()} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(PANEL_EXIT_MS);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the drawer on open and restores it on close", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = renderWithProviders(
      <DepartmentDrawer department={fixture()} onClose={vi.fn()} />,
    );
    expect(document.activeElement).toBe(screen.getByTestId(DepartmentDrawerTestId.Panel));

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  describe("header band (Velín-D)", () => {
    it("tints the band with the department's own hue, fading downward", () => {
      const hero = fixture();
      renderWithProviders(<DepartmentDrawer department={hero} onClose={vi.fn()} />);

      const band = screen.getByTestId(DepartmentDrawerTestId.Hero);
      expect(band.style.backgroundImage).toBe(
        `linear-gradient(180deg, ${hero.color}18, transparent)`,
      );
    });

    it("carries no portrait — the orb is the only identity mark", () => {
      renderWithProviders(<DepartmentDrawer department={fixture()} onClose={vi.fn()} />);

      const band = screen.getByTestId(DepartmentDrawerTestId.Hero);
      // The phase-90 hero art is gone for good (see `DepartmentSchema`): no
      // portrait may creep back into the band by any route.
      expect(band.style.backgroundImage).not.toContain("url(");
      expect(band.style.backgroundImage).not.toContain("image-set(");
      expect(band.querySelector("img")).toBeNull();
      // ...and the old 224px art band with it — this is a compact header row.
      expect(band.style.minHeight).toBe("");
    });

    it("builds the band gradient from any department hue", () => {
      expect(headerBandStyle("#b07cff").backgroundImage).toBe(
        "linear-gradient(180deg, #b07cff18, transparent)",
      );
    });
  });

  describe("statePillStyle / stateDotStyle (pure)", () => {
    it("statePillStyle derives a hairline capsule from the state color", () => {
      expect(statePillStyle("#7dd3fc")).toEqual({
        borderRadius: 999,
        border: "1px solid #7dd3fc44",
        background: "#7dd3fc12",
      });
    });

    it("stateDotStyle glows only when live", () => {
      expect(stateDotStyle("#7dd3fc", true)).toMatchObject({
        background: "#7dd3fc",
        boxShadow: "0 0 6px #7dd3fc",
      });
      expect(stateDotStyle("#7dd3fc", false)).toMatchObject({
        background: "#7dd3fc",
        boxShadow: "none",
      });
    });
  });

  it("defaults to the Roster tab and switches between all five tabs", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DepartmentDrawer department={fixture()} onClose={vi.fn()} />);

    expect(screen.getByTestId("roster-tab-stub")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Aktivita" }));
    expect(screen.getByTestId("aktivita-tab-stub")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Nastavení & Gates" }));
    expect(screen.getByTestId("gates-tab-stub")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Předávání" }));
    expect(screen.getByTestId("handoff-tab-stub")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Artefakty" }));
    expect(screen.getByTestId("artefakty-tab-stub")).toBeInTheDocument();

    expect(screen.getAllByRole("tab")).toHaveLength(5);
  });

  describe("modal backdrop and animation (phase 125)", () => {
    it("renders fully open once mounted (not stuck in the entering state)", () => {
      renderWithProviders(<DepartmentDrawer department={fixture()} onClose={vi.fn()} />);
      const panel = screen.getByTestId(DepartmentDrawerTestId.Panel);
      expect(panel).toHaveStyle({ opacity: "1", transform: "scale(1) translateY(0)" });
    });

    it("blurs and dims the backdrop", () => {
      renderWithProviders(<DepartmentDrawer department={fixture()} onClose={vi.fn()} />);
      const backdrop = screen.getByTestId(DepartmentDrawerTestId.Root);
      expect(backdrop.style.backdropFilter).toBe("blur(14px) saturate(140%)");
      expect(backdrop.style.background).toBe("rgba(11, 14, 19, 0.55)");
    });

    it("closes when clicking the backdrop itself", () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      renderWithProviders(<DepartmentDrawer department={fixture()} onClose={onClose} />);

      fireEvent.click(screen.getByTestId(DepartmentDrawerTestId.Root));
      expect(onClose).not.toHaveBeenCalled();

      vi.advanceTimersByTime(PANEL_EXIT_MS);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not close when clicking inside the panel", () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      renderWithProviders(<DepartmentDrawer department={fixture()} onClose={onClose} />);

      fireEvent.click(screen.getByTestId(DepartmentDrawerTestId.Panel));
      vi.advanceTimersByTime(PANEL_EXIT_MS);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("collapses to a fade-only transition under prefers-reduced-motion", () => {
      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
      renderWithProviders(<DepartmentDrawer department={fixture()} onClose={vi.fn()} />);

      const panel = screen.getByTestId(DepartmentDrawerTestId.Panel);
      expect(panel.style.transform).toBe("");
      expect(panel.style.transition).toBe("opacity 220ms cubic-bezier(0.16, 1, 0.3, 1)");
      vi.unstubAllGlobals();
    });
  });

  describe("backdropStyle / panelTransitionStyle (pure)", () => {
    it("backdropStyle fades in 180ms ease-out open, 140ms ease-in closing", () => {
      expect(backdropStyle("open")).toMatchObject({
        opacity: 1,
        transition: "opacity 180ms ease-out",
      });
      expect(backdropStyle("closing")).toMatchObject({
        opacity: 0,
        transition: "opacity 140ms ease-in",
      });
    });

    it("panelTransitionStyle scales+translates+fades open, hides entering/closing", () => {
      expect(panelTransitionStyle("open", false)).toMatchObject({
        opacity: 1,
        transform: "scale(1) translateY(0)",
        transition:
          "opacity 220ms cubic-bezier(0.16, 1, 0.3, 1), transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      });
      expect(panelTransitionStyle("entering", false)).toMatchObject({
        opacity: 0,
        transform: "scale(0.96) translateY(8px)",
      });
      expect(panelTransitionStyle("closing", false).transition).toBe(
        "opacity 140ms ease-in, transform 140ms ease-in",
      );
    });

    it("drops transform entirely under reduced motion", () => {
      const style = panelTransitionStyle("open", true);
      expect(style.transform).toBeUndefined();
      expect(style.transition).toBe("opacity 220ms cubic-bezier(0.16, 1, 0.3, 1)");
    });
  });

  describe("focus trap and scroll lock (phase 125)", () => {
    it("wraps Tab focus from the last focusable element back to the first", () => {
      renderWithProviders(<DepartmentDrawer department={fixture()} onClose={vi.fn()} />);

      screen.getByRole("tab", { name: "Artefakty" }).focus();
      fireEvent.keyDown(document, { key: "Tab" });

      expect(document.activeElement).toBe(screen.getByTestId(DepartmentDrawerTestId.Close));
    });

    it("wraps Shift+Tab from the first focusable element back to the last", () => {
      renderWithProviders(<DepartmentDrawer department={fixture()} onClose={vi.fn()} />);

      screen.getByTestId(DepartmentDrawerTestId.Close).focus();
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

      expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Artefakty" }));
    });

    it("locks body scroll while open and restores it on unmount", () => {
      const { unmount } = renderWithProviders(
        <DepartmentDrawer department={fixture()} onClose={vi.fn()} />,
      );
      expect(document.body.style.overflow).toBe("hidden");

      unmount();
      expect(document.body.style.overflow).toBe("");
    });

    it("cedes Escape to a nested DS Dialog and keeps scroll locked until the drawer itself closes", () => {
      // Fake timers, like the drawer's other Escape/close tests in this file:
      // `requestClose` defers the real `onClose` call behind a `setTimeout`, so
      // without advancing past it we couldn't observe whether the drawer's own
      // handler ever fired at all.
      vi.useFakeTimers();
      const onClose = vi.fn();
      const { unmount } = renderWithProviders(
        <DepartmentDrawer department={fixture()} onClose={onClose} />,
      );
      expect(document.body.style.overflow).toBe("hidden");

      const { unmount: unmountDialog } = render(
        <Dialog open title="Nested">
          nested
        </Dialog>,
      );
      expect(document.body.style.overflow).toBe("hidden");

      fireEvent.keyDown(document, { key: "Escape" });
      vi.advanceTimersByTime(PANEL_EXIT_MS);
      // The nested Dialog is topmost — it should be the one to react to
      // Escape (a no-op here, since this Dialog has no onClose wired), not the
      // drawer underneath it.
      expect(onClose).not.toHaveBeenCalled();

      unmountDialog();
      expect(document.body.style.overflow).toBe("hidden");

      unmount();
      expect(document.body.style.overflow).toBe("");
    });
  });
});
