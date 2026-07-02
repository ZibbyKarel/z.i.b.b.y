import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HookFormDialog, HookFormTestId } from "./HookFormDialog";

/**
 * The dialog is a pure controlled CREATE-ONLY form (N4e — editing lives on the
 * /hooks/:id detail page): it emits the create payload and never touches the
 * network. These tests pin the payload (incl. the tool-scoped matcher) and the
 * parsed timeout.
 */
describe("HookFormDialog", () => {
  it("emits a create payload with event, matcher and parsed timeout", async () => {
    const onCreate = vi.fn();
    render(<HookFormDialog onClose={vi.fn()} onCreate={onCreate} />);

    await userEvent.type(screen.getByTestId(HookFormTestId.Id), "audit-log");
    await userEvent.type(screen.getByTestId(HookFormTestId.Name), "Audit Log");
    // PreToolUse is the default event, so the matcher field is present.
    await userEvent.type(screen.getByTestId(HookFormTestId.Matcher), "Bash");
    await userEvent.type(screen.getByTestId(HookFormTestId.Command), "./audit.sh");
    await userEvent.type(screen.getByTestId(HookFormTestId.Timeout), "30");
    await userEvent.click(screen.getByTestId(HookFormTestId.Submit));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const body = onCreate.mock.calls[0]![0];
    expect(body).toEqual({
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
