import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { CommandLineTestId } from "../components/CommandLine/CommandLine";
import { NewTaskScreen } from "./NewTaskScreen";

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));

vi.mock("../../projects", () => ({
  useProjectsQuery: () => ({ data: [{ id: "zibby", name: "Zibby Web", path: "/work/zibby" }] }),
}));
vi.mock("../components/TaskAttachments", () => ({
  TaskAttachments: () => null,
}));

vi.mock("../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: [{ id: "koder", name: "Kodér", instructions: "x" }] }),
  getAgentsQueryKey: () => ["agents"],
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
    searchParams = new URLSearchParams();
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

  it("prefills the brief and a valid department entry from the COO dock's CREATE TASK (ZB-12)", () => {
    searchParams = new URLSearchParams({ text: "Draft the release notes", entry: "dev" });
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název"), { target: { value: "Notes" } });
    expect(screen.getByLabelText("Zadání")).toHaveValue("Draft the release notes");
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          text: "Draft the release notes",
          target: expect.objectContaining({ kind: "department", id: "dev" }),
        }),
      }),
      expect.anything(),
    );
  });

  it("ignores an unknown entry and falls back to the COO", () => {
    searchParams = new URLSearchParams({ text: "x y z", entry: "not-a-department" });
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název"), { target: { value: "T" } });
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    const body = createMutate.mock.calls[0]?.[0]?.body as { target?: { kind: string } };
    expect(body.target?.kind).not.toBe("department");
  });

  it("sends an @-mentioned agent as the explicit target", async () => {
    const user = userEvent.setup();
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název"), { target: { value: "T" } });
    await user.type(screen.getByTestId(CommandLineTestId.Input), "fix it @Kod");
    await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-koder`));
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          target: expect.objectContaining({ kind: "agent", id: "koder" }),
        }),
      }),
      expect.anything(),
    );
  });

  it("takes a #-picked project as the task's project (its path joins the dispatched paths)", async () => {
    const user = userEvent.setup();
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název"), { target: { value: "T" } });
    await user.type(screen.getByTestId(CommandLineTestId.Input), "fix it #Zib");
    await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-project-zibby`));
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    const body = createMutate.mock.calls[0]?.[0]?.body as { paths: string[]; target?: unknown };
    expect(body.paths).toContain("/work/zibby");
    expect(body.target).toBeUndefined();
  });
});
