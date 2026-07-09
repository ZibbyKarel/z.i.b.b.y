import { SUBSYSTEMS, type SubsystemWithStatus } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { SubsystemOrbsOverlay, SubsystemOrbsOverlayTestId } from "./SubsystemOrbsOverlay";

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

/** All 8 registry subsystems, each `klid` by default, some overridable by id. */
function allSubsystems(overrides: Record<string, Partial<SubsystemWithStatus>> = {}) {
  return SUBSYSTEMS.map((s) =>
    fixture({ id: s.id, name: s.name, color: s.color, ...(overrides[s.id] ?? {}) }),
  );
}

describe("SubsystemOrbsOverlay", () => {
  it("renders all 8 nodes from the subsystems prop (testid per registry id)", () => {
    renderWithProviders(<SubsystemOrbsOverlay onSelect={vi.fn()} subsystems={allSubsystems()} />);

    expect(screen.getByTestId(SubsystemOrbsOverlayTestId.Root)).toBeInTheDocument();
    for (const s of SUBSYSTEMS) {
      expect(screen.getByTestId(`${SubsystemOrbsOverlayTestId.Node}-${s.id}`)).toBeInTheDocument();
    }
  });

  it("renders fewer/shuffled entries by registry mapping — one node per entry", () => {
    const shuffled = [...allSubsystems()].reverse().slice(0, 5);
    renderWithProviders(<SubsystemOrbsOverlay onSelect={vi.fn()} subsystems={shuffled} />);
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("a node is a focusable button with an accessible name (identity + state)", () => {
    renderWithProviders(
      <SubsystemOrbsOverlay onSelect={vi.fn()} subsystems={allSubsystems({ forge: { state: "bezi" } })} />,
    );
    const node = screen.getByTestId(`${SubsystemOrbsOverlayTestId.Node}-forge`);
    expect(node).toHaveAttribute("role", "button");
    expect(node).toHaveAttribute("tabindex", "0");
    expect(node).toHaveAttribute("aria-label", expect.stringContaining("Forge"));
    // Default test locale is `cs` — `bezi` renders as "Běží" (the accessible name
    // carries the state, not just the identity).
    expect(node).toHaveAttribute("aria-label", expect.stringContaining("Běží"));
  });

  it("click fires onSelect with the subsystem id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(<SubsystemOrbsOverlay onSelect={onSelect} subsystems={allSubsystems()} />);

    await user.click(screen.getByTestId(`${SubsystemOrbsOverlayTestId.Node}-puls`));
    expect(onSelect).toHaveBeenCalledWith("puls");
  });

  it("Enter on a focused node fires onSelect (keyboard interaction)", () => {
    const onSelect = vi.fn();
    renderWithProviders(<SubsystemOrbsOverlay onSelect={onSelect} subsystems={allSubsystems()} />);

    const node = screen.getByTestId(`${SubsystemOrbsOverlayTestId.Node}-sentinel`);
    node.focus();
    node.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(onSelect).toHaveBeenCalledWith("sentinel");
  });

  it("Space on a focused node fires onSelect (keyboard interaction)", () => {
    const onSelect = vi.fn();
    renderWithProviders(<SubsystemOrbsOverlay onSelect={onSelect} subsystems={allSubsystems()} />);

    const node = screen.getByTestId(`${SubsystemOrbsOverlayTestId.Node}-maestro`);
    node.focus();
    node.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    expect(onSelect).toHaveBeenCalledWith("maestro");
  });

  it("sets aria-pressed only on the selected node", () => {
    renderWithProviders(
      <SubsystemOrbsOverlay onSelect={vi.fn()} selectedId="maestro" subsystems={allSubsystems()} />,
    );
    expect(screen.getByTestId(`${SubsystemOrbsOverlayTestId.Node}-maestro`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId(`${SubsystemOrbsOverlayTestId.Node}-forge`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("hides the badge at count 0, shows it once a hlaseni/ceka count is positive", () => {
    renderWithProviders(
      <SubsystemOrbsOverlay
        onSelect={vi.fn()}
        subsystems={allSubsystems({
          forge: { state: "hlaseni", tier2Count: 0 },
          puls: { state: "hlaseni", tier2Count: 3 },
          sentinel: { state: "ceka", tier3Count: 2 },
        })}
      />,
    );
    expect(
      screen.queryByTestId(`${SubsystemOrbsOverlayTestId.Badge}-forge`),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId(`${SubsystemOrbsOverlayTestId.Badge}-puls`)).toHaveTextContent("3");
    expect(screen.getByTestId(`${SubsystemOrbsOverlayTestId.Badge}-sentinel`)).toHaveTextContent(
      "2",
    );
  });

  it("renders a name label per node", () => {
    renderWithProviders(<SubsystemOrbsOverlay onSelect={vi.fn()} subsystems={allSubsystems()} />);
    expect(screen.getByTestId(`${SubsystemOrbsOverlayTestId.Label}-forge`)).toHaveTextContent(
      "Forge",
    );
  });

  it("every fixture state renders without throwing, one of each", () => {
    renderWithProviders(
      <SubsystemOrbsOverlay
        onSelect={vi.fn()}
        subsystems={allSubsystems({
          forge: { state: "klid" },
          puls: { state: "bezi" },
          sentinel: { state: "hlaseni", tier2Count: 1 },
          maestro: { state: "ceka", tier3Count: 1 },
        })}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(8);
  });
});
