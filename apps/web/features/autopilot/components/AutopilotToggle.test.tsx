import userEvent from "@testing-library/user-event";
import { type AutopilotStatus, NO_AUTOMATION } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { AutomationTreeTestId } from "./AutomationTree";
import { AutopilotToggle, AutopilotToggleTestId } from "./AutopilotToggle";

let status: AutopilotStatus = { level: "off", pendingApprovals: 3 };
let error: unknown = null;
const mutate = vi.fn();

vi.mock("../../companies", () => ({ useCompaniesQuery: () => ({ data: [] }) }));
vi.mock("../../teams", () => ({ useTeamsQuery: () => ({ data: [] }) }));
vi.mock("../queries", () => ({ useAutopilotQuery: () => ({ data: status }) }));
vi.mock("../mutations", () => ({
  useSetAutopilotMutation: () => ({ mutate, reset: vi.fn(), isPending: false, error }),
}));

const globalToggle = (key: string) =>
  within(
    screen
      .getAllByTestId(AutomationTreeTestId.Node)
      .find((el) => el.getAttribute("data-node") === "global") as HTMLElement,
  )
    .getAllByTestId(AutomationTreeTestId.Toggle)
    .find((el) => el.getAttribute("data-key") === key) as HTMLElement;

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
    await userEvent.click(within(globalToggle("autoCommunicate")).getByRole("switch"));
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Confirm));
    expect(mutate).toHaveBeenCalledWith(
      {
        body: {
          level: "full",
          automation: {
            global: { ...NO_AUTOMATION, autoCommunicate: true },
            companies: {},
            teams: {},
          },
        },
      },
      expect.anything(),
    );
  });

  it("nothing switched on disables confirm", async () => {
    render(<AutopilotToggle />);
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Toggle));
    expect(screen.getByTestId(AutopilotToggleTestId.Confirm)).toBeDisabled();
  });

  it("pre-fills the tree from the stored automation and sends it back", async () => {
    status = {
      level: "off",
      pendingApprovals: 0,
      automation: {
        global: { ...NO_AUTOMATION, autoReview: true },
        companies: {},
        teams: {},
      },
    };
    render(<AutopilotToggle />);
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Toggle));
    expect(within(globalToggle("autoReview")).getByRole("switch")).toBeChecked();
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Confirm));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          automation: expect.objectContaining({
            global: { ...NO_AUTOMATION, autoReview: true },
          }),
        }),
      }),
      expect.anything(),
    );
  });

  it("cancel closes the dialog without switching", async () => {
    render(<AutopilotToggle />);
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Toggle));
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Cancel));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("ON: the toggle opens the dialog with turn-off in place of cancel and update", async () => {
    status = {
      level: "full",
      since: "2026-10-29T12:00:00.000Z",
      by: "operator",
      pendingApprovals: 1,
      automation: { global: { ...NO_AUTOMATION, autoReview: true }, companies: {}, teams: {} },
    };
    render(<AutopilotToggle />);
    const toggle = screen.getByTestId(AutopilotToggleTestId.Toggle);
    expect(toggle).toHaveAccessibleName();
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle);
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.queryByTestId(AutopilotToggleTestId.Cancel)).not.toBeInTheDocument();
    expect(screen.getByTestId(AutopilotToggleTestId.Confirm)).toHaveTextContent("Upravit");
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.TurnOff));
    expect(mutate).toHaveBeenCalledWith({ body: { level: "off" } }, expect.anything());
  });

  it("a 401 says the operator token is missing", async () => {
    error = { status: 401, body: {} };
    render(<AutopilotToggle />);
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Toggle));
    expect(screen.getByTestId(AutopilotToggleTestId.Error)).toBeInTheDocument();
  });
});
