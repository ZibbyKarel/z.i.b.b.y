import { SUBSYSTEMS, type SubsystemWithStatus } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../../test/render";
import { SubsystemWeb, SubsystemWebTestId } from "./SubsystemWeb";

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

/** All 8 registry subsystems, each `klid` by default, one overridable by id. */
function allSubsystems(overrides: Record<string, Partial<SubsystemWithStatus>> = {}) {
  return SUBSYSTEMS.map((s) =>
    fixture({ id: s.id, name: s.name, color: s.color, ...(overrides[s.id] ?? {}) }),
  );
}

describe("SubsystemWeb", () => {
  it("renders all 8 nodes from the registry, plus the orb, spokes and rim", () => {
    renderWithProviders(<SubsystemWeb onSelect={vi.fn()} subsystems={allSubsystems()} />);

    expect(screen.getByTestId(SubsystemWebTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(SubsystemWebTestId.Orb)).toBeInTheDocument();
    expect(screen.getByTestId(SubsystemWebTestId.Spokes)).toBeInTheDocument();
    expect(screen.getByTestId(SubsystemWebTestId.Rim)).toBeInTheDocument();
    expect(screen.getByTestId(SubsystemWebTestId.Particles)).toBeInTheDocument();
    for (const s of SUBSYSTEMS) {
      expect(screen.getByTestId(`${SubsystemWebTestId.Node}-${s.id}`)).toBeInTheDocument();
    }
  });

  it("renders nodes even with fewer than 8 entries, or in shuffled order (positions are fixed elsewhere — geometry test owns that)", () => {
    const shuffled = [...allSubsystems()].reverse().slice(0, 5);
    renderWithProviders(<SubsystemWeb onSelect={vi.fn()} subsystems={shuffled} />);
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("a node is a focusable button with an accessible name (identity + state)", () => {
    renderWithProviders(
      <SubsystemWeb onSelect={vi.fn()} subsystems={allSubsystems({ forge: { state: "bezi" } })} />,
    );
    const node = screen.getByTestId(`${SubsystemWebTestId.Node}-forge`);
    expect(node).toHaveAttribute("role", "button");
    expect(node).toHaveAttribute("tabindex", "0");
    expect(node).toHaveAttribute("aria-label", expect.stringContaining("Forge"));
  });

  it("click fires onSelect with the subsystem id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(<SubsystemWeb onSelect={onSelect} subsystems={allSubsystems()} />);

    await user.click(screen.getByTestId(`${SubsystemWebTestId.Node}-puls`));
    expect(onSelect).toHaveBeenCalledWith("puls");
  });

  it("Enter on a focused node fires onSelect (keyboard interaction)", () => {
    const onSelect = vi.fn();
    renderWithProviders(<SubsystemWeb onSelect={onSelect} subsystems={allSubsystems()} />);

    const node = screen.getByTestId(`${SubsystemWebTestId.Node}-sentinel`);
    node.focus();
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(onSelect).toHaveBeenCalledWith("sentinel");
  });

  it("shows a selection ring only for the selected node (aria-pressed)", () => {
    renderWithProviders(
      <SubsystemWeb onSelect={vi.fn()} selectedId="maestro" subsystems={allSubsystems()} />,
    );
    expect(screen.getByTestId(`${SubsystemWebTestId.Node}-maestro`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId(`${SubsystemWebTestId.Node}-forge`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("hides the badge at count 0, and shows it once a hlaseni/ceka count is positive", () => {
    renderWithProviders(
      <SubsystemWeb
        onSelect={vi.fn()}
        subsystems={allSubsystems({
          forge: { state: "hlaseni", tier2Count: 0 },
          puls: { state: "hlaseni", tier2Count: 3 },
          sentinel: { state: "ceka", tier3Count: 2 },
        })}
      />,
    );
    expect(screen.queryByTestId(`${SubsystemWebTestId.Badge}-forge`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`${SubsystemWebTestId.Badge}-puls`)).toHaveTextContent("3");
    expect(screen.getByTestId(`${SubsystemWebTestId.Badge}-sentinel`)).toHaveTextContent("2");
  });

  it("every fixture state renders without throwing, one of each", () => {
    renderWithProviders(
      <SubsystemWeb
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
