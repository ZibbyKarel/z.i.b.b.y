import userEvent from "@testing-library/user-event";
import { type AutopilotStatus, NO_AUTOMATION } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { AutomationTreeTestId } from "./AutomationTree";
import { OptionToggleTestId } from "@zibby/design-system";
import { AutopilotToggle, AutopilotToggleTestId } from "./AutopilotToggle";

let status: AutopilotStatus = { level: "off", pendingApprovals: 3 };
let error: unknown = null;
const mutate = vi.fn();

vi.mock("../../companies", () => ({
  useCompaniesQuery: () => ({ data: [{ id: "shoptet", name: "Shoptet" }] }),
}));
vi.mock("../../teams", () => ({ useTeamsQuery: () => ({ data: [] }) }));
vi.mock("../queries", () => ({ useAutopilotQuery: () => ({ data: status }) }));
vi.mock("../mutations", () => ({
  useSetAutopilotMutation: () => ({ mutate, reset: vi.fn(), isPending: false, error }),
}));

beforeEach(() => {
  mutate.mockReset();
  status = { level: "off", pendingApprovals: 3 };
  error = null;
});

const open = () => userEvent.click(screen.getByTestId(AutopilotToggleTestId.Toggle));
const pick = (id: "off" | "full") =>
  userEvent.click(screen.getByTestId(`${OptionToggleTestId.Option}-${id}`));
const companyToggle = (key: string) =>
  within(
    screen
      .getAllByTestId(AutomationTreeTestId.Toggle)
      .find((el) => el.getAttribute("data-key") === key) as HTMLElement,
  ).getByRole("switch");

describe("AutopilotToggle", () => {
  it("opens on Approve, with no tree and no global toggles; saving sends level off", async () => {
    render(<AutopilotToggle />);
    const on = screen.getByTestId(AutopilotToggleTestId.Toggle);
    expect(on).toHaveAccessibleName();
    expect(on).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(on);
    expect(screen.getByTestId(`${OptionToggleTestId.Option}-off`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByTestId(AutomationTreeTestId.Root)).not.toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Confirm));
    expect(mutate).toHaveBeenCalledWith({ body: { level: "off" } }, expect.anything());
  });

  it("AUTOPILOT shows the tree; save is disabled until a company/team toggle is on", async () => {
    render(<AutopilotToggle />);
    await open();
    await pick("full");
    expect(screen.getByTestId(AutomationTreeTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(AutopilotToggleTestId.Confirm)).toBeDisabled();
  });

  it("starts on AUTOPILOT when on, forces global off and sends the company/team tree", async () => {
    status = {
      level: "full",
      since: "2026-10-29T12:00:00.000Z",
      by: "operator",
      pendingApprovals: 1,
      automation: {
        global: { ...NO_AUTOMATION, autoReview: true },
        companies: { shoptet: { autoImplement: true } },
        teams: {},
      },
    };
    render(<AutopilotToggle />);
    const toggle = screen.getByTestId(AutopilotToggleTestId.Toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle);
    expect(screen.getByTestId(`${OptionToggleTestId.Option}-full`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(companyToggle("autoReview")).not.toBeChecked();
    expect(companyToggle("autoImplement")).toBeChecked();
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Confirm));
    expect(mutate).toHaveBeenCalledWith(
      {
        body: {
          level: "full",
          automation: {
            global: { ...NO_AUTOMATION },
            companies: { shoptet: { autoImplement: true } },
            teams: {},
          },
        },
      },
      expect.anything(),
    );
  });

  it("switching a company toggle on enables save", async () => {
    status = {
      level: "off",
      pendingApprovals: 0,
      automation: {
        global: { ...NO_AUTOMATION },
        companies: { shoptet: { autoReview: true } },
        teams: {},
      },
    };
    render(<AutopilotToggle />);
    await open();
    await pick("full");
    expect(screen.getByTestId(AutopilotToggleTestId.Confirm)).toBeEnabled();
  });

  it("the help button is reachable in the header", async () => {
    render(<AutopilotToggle />);
    await open();
    expect(screen.getByTestId(AutopilotToggleTestId.Help)).toHaveAccessibleName();
  });

  it("cancel closes the dialog without saving", async () => {
    render(<AutopilotToggle />);
    await open();
    await userEvent.click(screen.getByTestId(AutopilotToggleTestId.Cancel));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("a 401 says the operator token is missing", async () => {
    error = { status: 401, body: {} };
    render(<AutopilotToggle />);
    await open();
    expect(screen.getByTestId(AutopilotToggleTestId.Error)).toBeInTheDocument();
  });
});
