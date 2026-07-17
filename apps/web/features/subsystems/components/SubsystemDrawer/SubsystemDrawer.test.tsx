import { SUBSYSTEMS, type SubsystemWithStatus } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "../../../../test/render";
import { SubsystemDrawer, SubsystemDrawerTestId, headerBandStyle } from "./SubsystemDrawer";

const markSeenMutate = vi.fn();

vi.mock("../../mutations/useMarkSubsystemSeenMutation", () => ({
  useMarkSubsystemSeenMutation: () => ({ mutate: markSeenMutate, isPending: false }),
}));

// The drawer's own suite covers chrome (header, tabs, focus, escape) — each
// tab's own real behavior gets its own full coverage in its own test file
// (`RosterTab.test.tsx` / `AktivitaTab.test.tsx` / `GatesTab.test.tsx` /
// `ArtefaktyTab.test.tsx`), so all four are stubbed here to keep this file's
// mocks focused on what it actually exercises.
vi.mock("./RosterTab", () => ({
  RosterTab: ({ subsystem }: { subsystem: { id: string } }) => (
    <div data-testid="roster-tab-stub">{subsystem.id}</div>
  ),
}));
vi.mock("./AktivitaTab", () => ({
  AktivitaTab: ({ subsystem }: { subsystem: { id: string } }) => (
    <div data-testid="aktivita-tab-stub">{subsystem.id}</div>
  ),
}));
vi.mock("./GatesTab", () => ({
  GatesTab: ({ subsystem }: { subsystem: { id: string } }) => (
    <div data-testid="gates-tab-stub">{subsystem.id}</div>
  ),
}));
vi.mock("./ArtefaktyTab", () => ({
  ArtefaktyTab: ({ subsystem }: { subsystem: { id: string } }) => (
    <div data-testid="artefakty-tab-stub">{subsystem.id}</div>
  ),
}));

function fixture(overrides: Partial<SubsystemWithStatus> = {}): SubsystemWithStatus {
  const base = SUBSYSTEMS[0]!;
  return {
    id: base.id,
    name: base.name,
    tagline: base.tagline,
    mandate: base.mandate,
    color: base.color,
    state: "idle",
    tier2Count: 0,
    tier3Count: 0,
    ...overrides,
  };
}

describe("SubsystemDrawer (Phase 84)", () => {
  beforeEach(() => {
    markSeenMutate.mockReset();
  });

  it("renders the panel and header identity", () => {
    renderWithProviders(<SubsystemDrawer onClose={vi.fn()} subsystem={fixture()} />);

    expect(screen.getByTestId(SubsystemDrawerTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(SubsystemDrawerTestId.Panel)).toBeInTheDocument();
    expect(screen.getByTestId(SubsystemDrawerTestId.Name)).toHaveTextContent(SUBSYSTEMS[0]!.name);
    // Velín-D folds the mandate and the epithet onto one line.
    const mandate = screen.getByTestId(SubsystemDrawerTestId.Mandate);
    expect(mandate).toHaveTextContent(SUBSYSTEMS[0]!.mandate);
    expect(mandate).toHaveTextContent(SUBSYSTEMS[0]!.tagline);
  });

  // The header's identity mark is the orb + the subsystem's own glyph. The DS
  // `Icon` renders its paths with no name attribute, so WHICH glyph landed
  // isn't observable here — `subsystemVisuals.test.ts` pins the id→glyph table
  // itself (the thing that could actually drift); this only pins that the
  // header renders the mark at all, rather than the old generic `bot` tile.
  it("renders the identity glyph over the orb", () => {
    renderWithProviders(
      <SubsystemDrawer onClose={vi.fn()} subsystem={fixture({ id: "sentinel" })} />,
    );
    expect(screen.getByTestId(SubsystemDrawerTestId.Glyph).querySelector("svg")).not.toBeNull();
  });

  it.each([
    ["idle", {}, "V klidu"],
    ["running", {}, "Běží"],
    ["report", { tier2Count: 3 }, "Hlášení připraveno"],
    ["waiting", { tier3Count: 2 }, "Čeká na rozhodnutí"],
  ] as const)("renders the header status for state %s", (state, extra, label) => {
    renderWithProviders(
      <SubsystemDrawer onClose={vi.fn()} subsystem={fixture({ state, ...extra })} />,
    );
    const status = screen.getByTestId(SubsystemDrawerTestId.Status);
    expect(status).toHaveTextContent(label);
  });

  it("shows the Tier-2/Tier-3 count badge only for report/waiting", () => {
    const { unmount } = renderWithProviders(
      <SubsystemDrawer onClose={vi.fn()} subsystem={fixture({ state: "report", tier2Count: 4 })} />,
    );
    // Shows the bare numeral (the pill beside it already says the state), but
    // still announces the full phrase.
    const count = screen.getByTestId(SubsystemDrawerTestId.Count);
    expect(count).toHaveTextContent("4");
    expect(count).toHaveAccessibleName("4 hlášení k nahlédnutí");
    unmount();

    // idle/running have nothing outstanding to count — the state pill alone.
    renderWithProviders(<SubsystemDrawer onClose={vi.fn()} subsystem={fixture()} />);
    expect(screen.queryByTestId(SubsystemDrawerTestId.Count)).toBeNull();
  });

  it("fires markSubsystemSeen exactly once per open — not again on a re-render with the same subsystem", () => {
    const { rerender } = renderWithProviders(
      <SubsystemDrawer onClose={vi.fn()} subsystem={fixture()} />,
    );
    expect(markSeenMutate).toHaveBeenCalledTimes(1);
    expect(markSeenMutate).toHaveBeenCalledWith({ params: { id: fixture().id }, body: {} });

    // A re-render with a FRESH object for the SAME id (e.g. the polled query
    // handing down a new reference) must not refire.
    rerender(<SubsystemDrawer onClose={vi.fn()} subsystem={fixture({ tier2Count: 1 })} />);
    expect(markSeenMutate).toHaveBeenCalledTimes(1);
  });

  it("fires markSubsystemSeen again when the selection swaps to a different subsystem", () => {
    const { rerender } = renderWithProviders(
      <SubsystemDrawer onClose={vi.fn()} subsystem={fixture({ id: "forge" })} />,
    );
    expect(markSeenMutate).toHaveBeenCalledTimes(1);

    rerender(<SubsystemDrawer onClose={vi.fn()} subsystem={fixture({ id: "puls" })} />);
    expect(markSeenMutate).toHaveBeenCalledTimes(2);
    expect(markSeenMutate).toHaveBeenLastCalledWith({ params: { id: "puls" }, body: {} });
  });

  it("closes via the header close button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<SubsystemDrawer onClose={onClose} subsystem={fixture()} />);

    await user.click(screen.getByTestId(SubsystemDrawerTestId.Close));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the glyph overlay non-interactive so it can't swallow a click", () => {
    renderWithProviders(<SubsystemDrawer onClose={vi.fn()} subsystem={fixture()} />);

    // The glyph sits ON TOP of the orb; it must never eat pointer events.
    // (The close button no longer needs this guard — Velín-D puts it in the
    // header's own flex row rather than floating it over the art.)
    expect(screen.getByTestId(SubsystemDrawerTestId.Glyph)).toHaveStyle({
      pointerEvents: "none",
    });
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderWithProviders(<SubsystemDrawer onClose={onClose} subsystem={fixture()} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the drawer on open and restores it on close", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = renderWithProviders(
      <SubsystemDrawer onClose={vi.fn()} subsystem={fixture()} />,
    );
    expect(document.activeElement).toBe(screen.getByTestId(SubsystemDrawerTestId.Panel));

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  describe("header band (Velín-D)", () => {
    it("tints the band with the subsystem's own hue, fading downward", () => {
      const hero = fixture();
      renderWithProviders(<SubsystemDrawer onClose={vi.fn()} subsystem={hero} />);

      const band = screen.getByTestId(SubsystemDrawerTestId.Hero);
      expect(band.style.backgroundImage).toBe(
        `linear-gradient(180deg, ${hero.color}18, transparent)`,
      );
    });

    it("carries no portrait — the orb is the only identity mark", () => {
      renderWithProviders(<SubsystemDrawer onClose={vi.fn()} subsystem={fixture()} />);

      const band = screen.getByTestId(SubsystemDrawerTestId.Hero);
      // The phase-90 hero art is gone for good (see `SubsystemSchema`): no
      // portrait may creep back into the band by any route.
      expect(band.style.backgroundImage).not.toContain("url(");
      expect(band.style.backgroundImage).not.toContain("image-set(");
      expect(band.querySelector("img")).toBeNull();
      // ...and the old 224px art band with it — this is a compact header row.
      expect(band.style.minHeight).toBe("");
    });

    it("builds the band gradient from any subsystem hue", () => {
      expect(headerBandStyle("#b07cff").backgroundImage).toBe(
        "linear-gradient(180deg, #b07cff18, transparent)",
      );
    });
  });

  it("defaults to the Roster tab and switches between all four tabs", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SubsystemDrawer onClose={vi.fn()} subsystem={fixture()} />);

    expect(screen.getByTestId("roster-tab-stub")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Aktivita" }));
    expect(screen.getByTestId("aktivita-tab-stub")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Nastavení & Gates" }));
    expect(screen.getByTestId("gates-tab-stub")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Artefakty" }));
    expect(screen.getByTestId("artefakty-tab-stub")).toBeInTheDocument();

    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });
});
