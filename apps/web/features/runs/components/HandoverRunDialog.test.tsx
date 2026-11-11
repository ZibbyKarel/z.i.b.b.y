import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { DropdownTestId } from "@zibby/design-system";
import type { RunView } from "../run";
import { HandoverRunDialog, HandoverRunDialogTestId } from "./HandoverRunDialog";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("../../agents", () => ({
  useAgentsQuery: () => ({ data: [{ id: "coder", name: "Coder" }] }),
}));
vi.mock("../../workflows", () => ({
  useWorkflowsQuery: () => ({ data: [{ id: "delivery", name: "Delivery" }] }),
}));
vi.mock("../../departments/useDepartmentLookup", () => ({
  useDepartmentLookup: () => ({ list: [{ id: "dev", name: "Development" }] }),
}));
vi.mock("../mutations", () => ({
  useHandoverTaskRunMutation: () => ({ mutate, isPending: false }),
}));

const run = { runId: "patch_1", kind: "workflow", status: "parked" } as RunView;

function renderDialog() {
  const onClose = vi.fn();
  const onHandedOver = vi.fn();
  render(<HandoverRunDialog open onClose={onClose} onHandedOver={onHandedOver} run={run} />);
  return { onClose, onHandedOver };
}

describe("HandoverRunDialog", () => {
  beforeEach(() => mutate.mockReset());

  it("offers workflows, agents and departments as targets", async () => {
    renderDialog();
    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const options = screen.getAllByTestId(DropdownTestId.Option).map((o) => o.textContent);
    expect(options).toEqual([
      expect.stringContaining("Delivery"),
      expect.stringContaining("Coder"),
      expect.stringContaining("Development"),
    ]);
  });

  it("shows the API's refusal when the handover fails", async () => {
    mutate.mockImplementation((_vars, opts?: { onError?: (e: unknown) => void }) =>
      opts?.onError?.({ status: 409, body: { message: "cannot be handed over" } }),
    );
    const { onHandedOver } = renderDialog();
    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    await userEvent.click(screen.getAllByTestId(DropdownTestId.Option)[0]!);
    await userEvent.click(screen.getByTestId(HandoverRunDialogTestId.Submit));
    expect(screen.getByTestId(HandoverRunDialogTestId.Error)).toHaveTextContent(
      "cannot be handed over",
    );
    expect(onHandedOver).not.toHaveBeenCalled();
  });

  it("submits nothing until a target is picked", () => {
    renderDialog();
    expect(screen.getByTestId(HandoverRunDialogTestId.Submit)).toBeDisabled();
  });

  it("hands over to the picked target with the note and reports the new run", async () => {
    mutate.mockImplementation((_vars, opts?: { onSuccess?: (r: unknown) => void }) =>
      opts?.onSuccess?.({ status: 200, body: { runId: "delivery_9" } }),
    );
    const { onHandedOver } = renderDialog();
    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    await userEvent.click(screen.getAllByTestId(DropdownTestId.Option)[0]!);
    await userEvent.type(screen.getByTestId(HandoverRunDialogTestId.Note), "finish it");
    await userEvent.click(screen.getByTestId(HandoverRunDialogTestId.Submit));
    expect(mutate).toHaveBeenCalledWith(
      {
        params: { runId: "patch_1" },
        body: { target: { kind: "workflow", id: "delivery", name: "Delivery" }, note: "finish it" },
      },
      expect.anything(),
    );
    expect(onHandedOver).toHaveBeenCalledWith("delivery_9");
  });
});
