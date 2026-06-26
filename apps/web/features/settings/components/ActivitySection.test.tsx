import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ActivityView, DEFAULT_ACTIVITY_VIEW } from "@zibby/contracts";
import { ActivitySection } from "./ActivitySection";

let view: ActivityView = DEFAULT_ACTIVITY_VIEW;
const setView = vi.fn();

vi.mock("../queries", () => ({ useActivityViewQuery: () => ({ data: view }) }));
vi.mock("../mutations", () => ({
  useSetActivityViewMutation: () => ({ mutate: setView, isPending: false }),
}));

beforeEach(() => {
  setView.mockReset();
  view = DEFAULT_ACTIVITY_VIEW;
});

describe("ActivitySection", () => {
  it("reflects the current mode per group (tasks default = visible)", () => {
    render(<ActivitySection />);
    // ButtonGroup option ids are `button-group-option-<id>`; tasks default visible.
    expect(screen.getAllByTestId("button-group-option-visible")[0]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("changing a group's mode PUTs the whole view with only that group changed", async () => {
    render(<ActivitySection />);
    // The first group row is `tasks`; flip it to hidden.
    await userEvent.click(screen.getAllByTestId("button-group-option-hidden")[0]!);
    expect(setView).toHaveBeenCalledWith({ body: { ...DEFAULT_ACTIVITY_VIEW, tasks: "hidden" } });
  });
});
