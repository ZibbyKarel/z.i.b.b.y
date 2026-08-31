import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DropdownTestId } from "@zibby/design-system";
import { SUBSYSTEMS } from "@zibby/contracts";
import { ChatQuickTask, ChatQuickTaskTestId } from "./ChatQuickTask";

type MutateVars = { body: { text: string; target?: Record<string, unknown> } };
type MutateOpts = { onSuccess?: (result: { body: unknown }) => void };

const FAKE_RESULT = { body: { outcome: "pending", task: { id: "task-1" } } };

const createTask = vi.fn((_vars: MutateVars, opts?: MutateOpts) => opts?.onSuccess?.(FAKE_RESULT));

vi.mock("../../tasks/mutations", () => ({
  useCreateTaskMutation: () => ({ mutate: createTask, isPending: false }),
}));

describe("ChatQuickTask — bottom-bar run-a-task composer", () => {
  beforeEach(() => {
    createTask.mockClear();
  });

  it("renders the subsystem select, text area and run button", () => {
    render(<ChatQuickTask onClose={vi.fn()} />);
    expect(screen.getByTestId(ChatQuickTaskTestId.Subsystem)).toBeInTheDocument();
    expect(screen.getByTestId(ChatQuickTaskTestId.Text)).toBeInTheDocument();
    expect(screen.getByTestId(ChatQuickTaskTestId.Run)).toBeInTheDocument();
  });

  it("offers all 8 subsystems in the select, defaulting to the first", async () => {
    const user = userEvent.setup();
    render(<ChatQuickTask onClose={vi.fn()} />);
    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    const labels = screen.getAllByTestId(DropdownTestId.Option).map((o) => o.textContent);
    expect(labels).toEqual(SUBSYSTEMS.map((s) => s.name));
  });

  it("disables Run until there is text", () => {
    render(<ChatQuickTask onClose={vi.fn()} />);
    expect(screen.getByTestId(ChatQuickTaskTestId.Run)).toBeDisabled();
  });

  it("enables Run once text is typed", async () => {
    render(<ChatQuickTask onClose={vi.fn()} />);
    await userEvent.type(screen.getByTestId(ChatQuickTaskTestId.Text), "fix the flaky test");
    expect(screen.getByTestId(ChatQuickTaskTestId.Run)).toBeEnabled();
  });

  it("running POSTs the text and a subsystem target for the selected subsystem, then closes", async () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<ChatQuickTask onClose={onClose} onCreated={onCreated} />);

    // Pick the second subsystem instead of the default first.
    await user.click(screen.getByTestId(DropdownTestId.Trigger));
    const target = SUBSYSTEMS[1];
    if (!target) throw new Error("expected at least 2 subsystems");
    await user.click(
      screen.getAllByTestId(DropdownTestId.Option).find((o) => o.textContent === target.name)!,
    );

    await userEvent.type(screen.getByTestId(ChatQuickTaskTestId.Text), "watch the CI pipeline");
    await user.click(screen.getByTestId(ChatQuickTaskTestId.Run));

    expect(createTask).toHaveBeenCalledTimes(1);
    const body = createTask.mock.calls[0]?.[0].body;
    expect(body?.text).toBe("watch the CI pipeline");
    expect(body?.target).toMatchObject({ kind: "subsystem", id: target.id });

    expect(onCreated).toHaveBeenCalledWith(FAKE_RESULT.body);
    expect(onClose).toHaveBeenCalled();
  });

  it("Close fires onClose without running a task", async () => {
    const onClose = vi.fn();
    render(<ChatQuickTask onClose={onClose} />);
    await userEvent.type(screen.getByTestId(ChatQuickTaskTestId.Text), "won't be run");
    await userEvent.click(screen.getByTestId(ChatQuickTaskTestId.Close));
    expect(createTask).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
