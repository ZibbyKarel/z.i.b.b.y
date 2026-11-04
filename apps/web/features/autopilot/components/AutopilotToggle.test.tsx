import userEvent from "@testing-library/user-event";
import type { AutopilotStatus } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { AutopilotToggle, AutopilotToggleTestId } from "./AutopilotToggle";

let status: AutopilotStatus = { level: "off", pendingApprovals: 3 };
let error: unknown = null;
const mutate = vi.fn();

vi.mock("../queries", () => ({ useAutopilotQuery: () => ({ data: status }) }));
vi.mock("../mutations", () => ({
  useSetAutopilotMutation: () => ({ mutate, reset: vi.fn(), isPending: false, error }),
}));

beforeEach(() => {
  mutate.mockReset();
  status = { level: "off", pendingApprovals: 3 };
  error = null;
});

describe("AutopilotToggle", () => {
  it("OFF: turning on goes through a confirm dialog that shows the pending count", async () => {
    render(<AutopilotToggle />);
    const on = screen.getByTestId(AutopilotToggleTestId.Toggle);
    expect(on).toHaveAccessibleName();
    expect(on).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(on);
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/3/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Confirm));
    expect(mutate).toHaveBeenCalledWith(
      { body: { level: "full", scope: { reviews: true, comments: true, communication: true } } },
      expect.anything(),
    );
  });

  it("the dialog shows three scope switches, all on by default", async () => {
    render(<AutopilotToggle />);
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Toggle));
    for (const id of [
      AutopilotToggleTestId.ScopeReviews,
      AutopilotToggleTestId.ScopeComments,
      AutopilotToggleTestId.ScopeCommunication,
    ]) {
      expect(screen.getByTestId(id)).toHaveRole("switch");
      expect(screen.getByTestId(id)).toBeChecked();
    }
  });

  it("switching one off sends that scope", async () => {
    render(<AutopilotToggle />);
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Toggle));
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.ScopeComments));
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Confirm));
    expect(mutate).toHaveBeenCalledWith(
      { body: { level: "full", scope: { reviews: true, comments: false, communication: true } } },
      expect.anything(),
    );
  });

  it("all switches off disables confirm", async () => {
    render(<AutopilotToggle />);
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Toggle));
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.ScopeReviews));
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.ScopeComments));
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.ScopeCommunication));
    expect(screen.getByTestId(AutopilotToggleTestId.Confirm)).toBeDisabled();
  });

  it("cancel closes the dialog without switching", async () => {
    render(<AutopilotToggle />);
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Toggle));
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Cancel));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("ON: the pressed toggle switches off in one click", async () => {
    status = {
      level: "full",
      since: "2026-10-29T12:00:00.000Z",
      by: "operator",
      pendingApprovals: 1,
    };
    render(<AutopilotToggle />);
    const off = screen.getByTestId(AutopilotToggleTestId.Toggle);
    expect(off).toHaveAccessibleName();
    expect(off).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(off);
    expect(mutate).toHaveBeenCalledWith({ body: { level: "off" } });
  });

  it("a 401 says the operator token is missing", async () => {
    error = { status: 401, body: {} };
    render(<AutopilotToggle />);
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Toggle));
    expect(screen.getByTestId(AutopilotToggleTestId.Error)).toBeInTheDocument();
  });
});
