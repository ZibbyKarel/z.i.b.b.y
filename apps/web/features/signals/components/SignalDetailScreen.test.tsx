import type { HandoffSignalKind } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { SignalDetailScreen, SignalDetailScreenTestId } from "./SignalDetailScreen";
import { SignalStatusBadgeTestId } from "./SignalStatusBadge";

const { hooks } = vi.hoisted(() => ({
  hooks: {
    signalKinds: {
      data: [] as unknown[],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    subsystems: {
      data: [
        { id: "sentinel", name: "Sentinel" },
        { id: "loom", name: "Loom" },
      ],
    },
  },
}));

vi.mock("../../handoff/queries", () => ({
  useSignalKindsQuery: () => hooks.signalKinds,
}));
vi.mock("../../subsystems/queries", () => ({
  useSubsystemsQuery: () => hooks.subsystems,
}));

const CVE: HandoffSignalKind = {
  id: "cve",
  from: "sentinel",
  label: "CVE (stored)",
  description: "stored description",
  severityBearing: true,
  status: "builtin",
  system: true,
};

const PENDING_WITH_BUILD_TASK: HandoffSignalKind = {
  id: "custom-thing",
  from: "loom",
  label: "Custom Thing",
  description: "an operator-registered signal",
  severityBearing: false,
  status: "pending",
  system: false,
  buildTaskId: "task-42",
};

beforeEach(() => {
  hooks.signalKinds = {
    data: [CVE, PENDING_WITH_BUILD_TASK],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
});

describe("SignalDetailScreen (B3a, read-only)", () => {
  it("renders a built-in kind's localized label, builtin badge and system note — no mutating controls", () => {
    render(<SignalDetailScreen signalId="cve" />);

    expect(screen.getByText("Zranitelnost (CVE)")).toBeInTheDocument();
    expect(screen.getByTestId(SignalStatusBadgeTestId.Root)).toHaveTextContent("vestavěný");
    expect(screen.getByTestId(SignalDetailScreenTestId.SystemNote)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Smazat" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Uložit" })).toBeNull();
  });

  it("renders a pending kind's build-task link when buildTaskId is set", () => {
    render(<SignalDetailScreen signalId="custom-thing" />);

    expect(screen.getByText("Custom Thing")).toBeInTheDocument();
    expect(screen.getByTestId(SignalStatusBadgeTestId.Root)).toHaveTextContent(
      "čeká na producenta",
    );
    expect(screen.queryByTestId(SignalDetailScreenTestId.SystemNote)).toBeNull();
    expect(screen.getByTestId(SignalDetailScreenTestId.BuildTaskLink)).toHaveAttribute(
      "href",
      "/archiv?run=task-42",
    );
  });

  it("renders the not-found state for an unknown id", () => {
    render(<SignalDetailScreen signalId="does-not-exist" />);
    const notFound = screen.getByTestId(SignalDetailScreenTestId.NotFound);
    expect(notFound).toBeInTheDocument();
    // The page title and the EmptyState both render "Signál nenalezen" — assert
    // within the EmptyState wrapper to avoid a duplicate-text match.
    expect(within(notFound).getByText("Signál nenalezen")).toBeInTheDocument();
  });
});
