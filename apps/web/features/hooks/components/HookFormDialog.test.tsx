import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HookFormDialog, HookFormTestId } from "./HookFormDialog";

/**
 * The dialog is a pure controlled form: it emits a `{ create | update }` draft and
 * never touches the network. These tests pin the create payload (incl. the
 * tool-scoped matcher) and the parsed timeout.
 */
describe("HookFormDialog", () => {
  it("emits a create payload with event, matcher and parsed timeout", async () => {
    const onSubmit = vi.fn();
    render(<HookFormDialog onClose={vi.fn()} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByTestId(HookFormTestId.Id), "audit-log");
    await userEvent.type(screen.getByTestId(HookFormTestId.Name), "Audit Log");
    // PreToolUse is the default event, so the matcher field is present.
    await userEvent.type(screen.getByTestId(HookFormTestId.Matcher), "Bash");
    await userEvent.type(screen.getByTestId(HookFormTestId.Command), "./audit.sh");
    await userEvent.type(screen.getByTestId(HookFormTestId.Timeout), "30");
    await userEvent.click(screen.getByTestId(HookFormTestId.Submit));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const draft = onSubmit.mock.calls[0]![0];
    expect(draft.create).toEqual({
      id: "audit-log",
      name: "Audit Log",
      event: "PreToolUse",
      matcher: "Bash",
      command: "./audit.sh",
      timeout: 30,
      enabled: true,
    });
  });
});
