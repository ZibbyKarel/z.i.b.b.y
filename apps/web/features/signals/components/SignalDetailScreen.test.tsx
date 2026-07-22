import type { HandoffSignalKind } from "@zibby/contracts";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { SignalDetailScreen, SignalDetailScreenTestId } from "./SignalDetailScreen";
import { SignalStatusBadgeTestId } from "./SignalStatusBadge";

const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back }) }));

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
    deleteMutation: { mutate: vi.fn(), isPending: false },
    createMutation: { mutate: vi.fn(), isPending: false, isError: false },
    updateMutation: { mutate: vi.fn(), isPending: false, isError: false },
  },
}));

vi.mock("../../handoff/queries", () => ({
  useSignalKindsQuery: () => hooks.signalKinds,
}));
vi.mock("../../subsystems/queries", () => ({
  useSubsystemsQuery: () => hooks.subsystems,
}));
vi.mock("../../handoff/mutations", () => ({
  useDeleteSignalKindMutation: () => hooks.deleteMutation,
  useCreateSignalKindMutation: () => hooks.createMutation,
  useUpdateSignalKindMutation: () => hooks.updateMutation,
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
  push.mockClear();
  back.mockClear();
  hooks.signalKinds = {
    data: [CVE, PENDING_WITH_BUILD_TASK],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
  hooks.deleteMutation = { mutate: vi.fn(), isPending: false };
  hooks.createMutation = { mutate: vi.fn(), isPending: false, isError: false };
  hooks.updateMutation = { mutate: vi.fn(), isPending: false, isError: false };
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

describe("SignalDetailScreen — edit + delete (B3c)", () => {
  it("an operator kind shows Upravit + Smazat", () => {
    render(<SignalDetailScreen signalId="custom-thing" />);
    expect(screen.getByTestId(SignalDetailScreenTestId.EditAction)).toBeInTheDocument();
    expect(screen.getByTestId(SignalDetailScreenTestId.DeleteAction)).toBeInTheDocument();
  });

  it("a built-in kind shows neither Upravit nor Smazat", () => {
    render(<SignalDetailScreen signalId="cve" />);
    expect(screen.queryByTestId(SignalDetailScreenTestId.EditAction)).toBeNull();
    expect(screen.queryByTestId(SignalDetailScreenTestId.DeleteAction)).toBeNull();
  });

  it("clicking Upravit reveals the prefilled form", async () => {
    render(<SignalDetailScreen signalId="custom-thing" />);
    await userEvent.click(screen.getByTestId(SignalDetailScreenTestId.EditAction));

    const editForm = screen.getByTestId(SignalDetailScreenTestId.EditForm);
    expect(editForm).toBeInTheDocument();
    expect(within(editForm).getByDisplayValue("Custom Thing")).toBeInTheDocument();
    expect(within(editForm).getByDisplayValue("an operator-registered signal")).toBeInTheDocument();
  });

  it("confirming delete calls the delete mutation with the right id and navigates to /signals", async () => {
    hooks.deleteMutation.mutate = vi.fn((_vars, opts) => {
      opts?.onSuccess?.();
    });
    render(<SignalDetailScreen signalId="custom-thing" />);

    await userEvent.click(screen.getByTestId(SignalDetailScreenTestId.DeleteAction));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Smazat" }));

    expect(hooks.deleteMutation.mutate).toHaveBeenCalledWith(
      { params: { id: "custom-thing" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(push).toHaveBeenCalledWith("/signals");
  });
});
