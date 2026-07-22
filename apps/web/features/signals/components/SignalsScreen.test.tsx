import type { HandoffSignalKind } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { SignalKindCardTestId } from "./SignalKindCard";
import { SignalStatusBadgeTestId } from "./SignalStatusBadge";
import { SignalsScreen } from "./SignalsScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { hooks } = vi.hoisted(() => ({
  hooks: {
    signalKinds: {
      data: [] as unknown[],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    subsystems: { data: [] as unknown[] },
  },
}));

vi.mock("../../handoff/queries", () => ({
  useSignalKindsQuery: () => hooks.signalKinds,
}));
vi.mock("../../subsystems/queries", () => ({
  useSubsystemsQuery: () => hooks.subsystems,
}));

const SENTINEL = { id: "sentinel", name: "Sentinel" };
const LOOM = { id: "loom", name: "Loom" };

const CVE: HandoffSignalKind = {
  id: "cve",
  from: "sentinel",
  label: "CVE (stored)",
  description: "stored description",
  severityBearing: true,
  status: "builtin",
  system: true,
};

const CUSTOM: HandoffSignalKind = {
  id: "custom-thing",
  from: "loom",
  label: "Custom Thing",
  description: "an operator-registered signal",
  severityBearing: false,
  status: "pending",
  system: false,
};

describe("SignalsScreen (B3a)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.signalKinds = { data: [CVE, CUSTOM], isPending: false, isError: false, refetch: vi.fn() };
    hooks.subsystems = { data: [SENTINEL, LOOM] };
  });

  it("groups kinds by producer subsystem, one section per producer", () => {
    render(<SignalsScreen />);

    const sentinelCard = screen.getByTestId(`${SignalKindCardTestId.Root}-cve`);
    const loomCard = screen.getByTestId(`${SignalKindCardTestId.Root}-custom-thing`);

    // The producer's display name heads its own group.
    expect(screen.getByText("Sentinel")).toBeInTheDocument();
    expect(screen.getByText("Loom")).toBeInTheDocument();
    // A built-in id renders its localized label (cs catalog), an operator id
    // renders the stored label verbatim.
    expect(within(sentinelCard).getByText("Zranitelnost (CVE)")).toBeInTheDocument();
    expect(within(loomCard).getByText("Custom Thing")).toBeInTheDocument();
  });

  it("shows a distinct status badge per kind", () => {
    render(<SignalsScreen />);
    const sentinelCard = screen.getByTestId(`${SignalKindCardTestId.Root}-cve`);
    const loomCard = screen.getByTestId(`${SignalKindCardTestId.Root}-custom-thing`);

    expect(within(sentinelCard).getByTestId(SignalStatusBadgeTestId.Root)).toHaveTextContent(
      "vestavěný",
    );
    expect(within(loomCard).getByTestId(SignalStatusBadgeTestId.Root)).toHaveTextContent(
      "čeká na producenta",
    );
  });

  it("a card click NAVIGATES to the signal detail route", async () => {
    render(<SignalsScreen />);
    const card = screen.getByTestId(`${SignalKindCardTestId.Root}-cve`);
    await userEvent.click(within(card).getByRole("button"));
    expect(push).toHaveBeenCalledWith("/signals/cve");
  });

  it('"Nový signál" NAVIGATES to /signals/new — no create dialog here (B3b)', async () => {
    render(<SignalsScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Nový signál" }));
    expect(push).toHaveBeenCalledWith("/signals/new");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the empty state when the registry has no kinds for any subsystem", () => {
    hooks.signalKinds = { data: [], isPending: false, isError: false, refetch: vi.fn() };
    render(<SignalsScreen />);
    expect(screen.getByText("Zatím žádné signály")).toBeInTheDocument();
  });
});
