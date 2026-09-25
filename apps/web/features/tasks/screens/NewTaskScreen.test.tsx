import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { NewTaskScreen } from "./NewTaskScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("../../projects", () => ({ useProjectsQuery: () => ({ data: [] }) }));
vi.mock("../components/TaskAttachments", () => ({
  TaskAttachments: () => null,
}));

const classifyMutate = vi.fn();
const createMutate = vi.fn();
vi.mock("../mutations", () => ({
  useClassifyTaskMutation: () => ({ mutate: classifyMutate, data: undefined }),
  useCreateTaskMutation: () => ({ mutate: createMutate, isPending: false }),
}));

describe("NewTaskScreen (ZB-04b)", () => {
  beforeEach(() => {
    push.mockClear();
    classifyMutate.mockClear();
    createMutate.mockClear();
  });

  it("disables submit until title and brief are filled", () => {
    render(<NewTaskScreen />);
    expect(screen.getByText("Vytvořit úkol")).toBeDisabled();
  });

  it("submits the task with the typed title and brief", () => {
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název"), { target: { value: "Ship it" } });
    fireEvent.change(screen.getByLabelText("Zadání"), { target: { value: "Do the thing" } });
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ title: "Ship it", text: "Do the thing" }),
      }),
      expect.anything(),
    );
  });

  it("navigates back to the tasks list on cancel", () => {
    render(<NewTaskScreen />);
    fireEvent.click(screen.getByText("Zrušit"));
    expect(push).toHaveBeenCalledWith("/work/tasks");
  });
});
