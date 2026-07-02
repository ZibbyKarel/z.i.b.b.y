import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { McpServerFormDialog, McpServerFormTestId } from "./McpServerFormDialog";

/**
 * The dialog is a pure controlled CREATE-ONLY form (N4e — editing lives on the
 * /mcp/:id detail page): it emits a `{ create, authToken }` draft and never
 * touches the network. These tests pin the stdio create payload and that a
 * freshly entered token rides alongside (the screen persists it through the
 * separate credentials mutation) — never folded into the create body.
 */
describe("McpServerFormDialog", () => {
  it("emits a stdio create payload with parsed args and the token separately", async () => {
    const onSubmit = vi.fn();
    render(<McpServerFormDialog onClose={vi.fn()} onCreate={onSubmit} />);

    // stdio is the default transport, so command/args fields are present.
    await userEvent.type(screen.getByTestId(McpServerFormTestId.Id), "github");
    await userEvent.type(screen.getByTestId(McpServerFormTestId.Name), "GitHub");
    await userEvent.type(screen.getByTestId(McpServerFormTestId.Command), "npx");
    await userEvent.type(screen.getByTestId(McpServerFormTestId.Args), "-y, server-github");
    await userEvent.type(screen.getByTestId(McpServerFormTestId.AuthToken), "ghp-secret");
    await userEvent.click(screen.getByTestId(McpServerFormTestId.Submit));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const draft = onSubmit.mock.calls[0]![0];
    expect(draft.create).toEqual({
      id: "github",
      type: "stdio",
      name: "GitHub",
      enabled: true,
      command: "npx",
      args: ["-y", "server-github"],
      url: undefined,
      headers: undefined,
    });
    // The token is carried out-of-band, never inside the persisted config.
    expect(draft.authToken).toBe("ghp-secret");
    expect(JSON.stringify(draft.create)).not.toContain("ghp-secret");
  });

  it("switches to url/headers fields when the transport is http", async () => {
    const onSubmit = vi.fn();
    render(<McpServerFormDialog onClose={vi.fn()} onCreate={onSubmit} />);

    await userEvent.click(screen.getByTestId("dropdown-trigger"));
    await userEvent.click(screen.getByText("HTTP"));

    await userEvent.type(screen.getByTestId(McpServerFormTestId.Id), "remote");
    await userEvent.type(screen.getByTestId(McpServerFormTestId.Url), "https://mcp.example.com");
    await userEvent.click(screen.getByTestId(McpServerFormTestId.Submit));

    const draft = onSubmit.mock.calls[0]![0];
    expect(draft.create.type).toBe("http");
    expect(draft.create.url).toBe("https://mcp.example.com");
    expect(draft.create.command).toBeUndefined();
  });
});
