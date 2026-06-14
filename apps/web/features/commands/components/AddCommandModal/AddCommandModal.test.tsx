import { renderWithProviders as render, screen, waitFor } from "../../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddCommandModal } from "./AddCommandModal";

/**
 * The modal is a pure controlled form: it emits a camelCase submit object (the
 * Screen maps it back to the kebab-case contract keys) and never touches the
 * network. This pins the id, the parsed allowed-tools list and the body.
 */
describe("AddCommandModal", () => {
  it("emits a create submit with parsed allowed-tools and the body", async () => {
    const onSubmit = vi.fn();
    render(<AddCommandModal onClose={vi.fn()} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByRole("textbox", { name: /identifikátor/i }), "orchestrate");
    await userEvent.type(
      screen.getByRole("textbox", { name: /tools/i }),
      "Read, Bash",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /instrukce/i }),
      "Do $ARGUMENTS",
    );
    await userEvent.click(screen.getByRole("button", { name: /vytvořit/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const values = onSubmit.mock.calls[0]![0];
    expect(values.id).toBe("orchestrate");
    expect(values.allowedTools).toEqual(["Read", "Bash"]);
    expect(values.instructions).toBe("Do $ARGUMENTS");
    expect(values.enabled).toBe(true);
  });
});
