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
    departments: { data: [] as unknown[] },
  },
}));

vi.mock("../../handoff/queries", () => ({
  useSignalKindsQuery: () => hooks.signalKinds,
}));
vi.mock("../../departments/queries", () => ({
  useDepartmentsQuery: () => hooks.departments,
}));

const SECURITY = { id: "sec", name: "Security" };
const ARCH = { id: "qa", name: "Arch" };

const CVE: HandoffSignalKind = {
  id: "cve",
  from: "sec",
  label: "CVE (stored)",
  description: "stored description",
  severityBearing: true,
  status: "builtin",
  system: true,
};

const CUSTOM: HandoffSignalKind = {
  id: "custom-thing",
  from: "qa",
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
    hooks.departments = { data: [SECURITY, ARCH] };
  });

  it("groups kinds by producer department, one section per producer", () => {
    render(<SignalsScreen />);

    const securityCard = screen.getByTestId(`${SignalKindCardTestId.Root}-cve`);
    const archCard = screen.getByTestId(`${SignalKindCardTestId.Root}-custom-thing`);

    // The producer's display name heads its own group.
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Arch")).toBeInTheDocument();
    // A built-in id renders its localized label (cs catalog), an operator id
    // renders the stored label verbatim.
    expect(within(securityCard).getByText("Zranitelnost (CVE)")).toBeInTheDocument();
    expect(within(archCard).getByText("Custom Thing")).toBeInTheDocument();
  });

  it("shows a distinct status badge per kind", () => {
    render(<SignalsScreen />);
    const securityCard = screen.getByTestId(`${SignalKindCardTestId.Root}-cve`);
    const archCard = screen.getByTestId(`${SignalKindCardTestId.Root}-custom-thing`);

    expect(within(securityCard).getByTestId(SignalStatusBadgeTestId.Root)).toHaveTextContent(
      "vestavěný",
    );
    expect(within(archCard).getByTestId(SignalStatusBadgeTestId.Root)).toHaveTextContent(
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

  it("renders the empty state when the registry has no kinds for any department", () => {
    hooks.signalKinds = { data: [], isPending: false, isError: false, refetch: vi.fn() };
    render(<SignalsScreen />);
    expect(screen.getByText("Zatím žádné signály")).toBeInTheDocument();
  });
});
