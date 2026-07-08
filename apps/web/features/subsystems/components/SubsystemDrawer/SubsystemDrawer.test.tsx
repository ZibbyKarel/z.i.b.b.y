import { SUBSYSTEMS, type SubsystemWithStatus } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "../../../../test/render";
import { SubsystemDrawer, SubsystemDrawerTestId } from "./SubsystemDrawer";

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
    heroImage: null,
    state: "klid",
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
    expect(screen.getByTestId(SubsystemDrawerTestId.Tagline)).toHaveTextContent(
      SUBSYSTEMS[0]!.tagline,
    );
    expect(screen.getByTestId(SubsystemDrawerTestId.Mandate)).toHaveTextContent(
      SUBSYSTEMS[0]!.mandate,
    );
  });

  it.each([
    ["klid", {}, "V klidu"],
    ["bezi", {}, "Běží"],
    ["hlaseni", { tier2Count: 3 }, "Hlášení připraveno"],
    ["ceka", { tier3Count: 2 }, "Čeká na rozhodnutí"],
  ] as const)("renders the header status for state %s", (state, extra, label) => {
    renderWithProviders(
      <SubsystemDrawer onClose={vi.fn()} subsystem={fixture({ state, ...extra })} />,
    );
    const status = screen.getByTestId(SubsystemDrawerTestId.Status);
    expect(status).toHaveTextContent(label);
  });

  it("shows the Tier-2/Tier-3 count badge only for hlaseni/ceka", () => {
    renderWithProviders(
      <SubsystemDrawer onClose={vi.fn()} subsystem={fixture({ state: "hlaseni", tier2Count: 4 })} />,
    );
    expect(screen.getByTestId(SubsystemDrawerTestId.Status)).toHaveTextContent("4");
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
