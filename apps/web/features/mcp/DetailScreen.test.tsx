import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@zibby/contracts";
import { DetailScreen, McpDetailScreenTestId } from "./DetailScreen";
import { McpServerFormTestId } from "./components/McpServerFormFields";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const SERVER: McpServer = {
  id: "github",
  type: "stdio",
  name: "GitHub",
  command: "npx",
  args: ["-y", "server-github"],
  enabled: true,
  hasCredentials: true,
};

const { hooks } = vi.hoisted(() => ({
  hooks: {
    server: { data: undefined as unknown, isPending: false, isError: false, refetch: vi.fn() },
    update: vi.fn(),
    del: vi.fn(),
    setCredentials: vi.fn(),
  },
}));

vi.mock("./queries", () => ({
  useMcpServerQuery: () => hooks.server,
}));
vi.mock("./mutations", () => ({
  useUpdateMcpServerMutation: () => ({ mutate: hooks.update, isPending: false }),
  useDeleteMcpServerMutation: () => ({ mutate: hooks.del, isPending: false }),
  useSetMcpCredentialsMutation: () => ({ mutate: hooks.setCredentials, isPending: false }),
}));

describe("mcp DetailScreen (N4e grammar)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.update.mockClear();
    hooks.del.mockClear();
    hooks.setCredentials.mockClear();
    hooks.server = { data: SERVER, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("locks the transport and shows top-right actions by accessible name", () => {
    render(<DetailScreen serverId="github" />);
    expect(screen.getByRole("button", { name: "Uložit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Smazat" })).toBeInTheDocument();
    expect(screen.getByTestId(McpServerFormTestId.Type).tagName).not.toBe("INPUT");
    expect(screen.getByTestId(McpServerFormTestId.Type)).toHaveTextContent("stdio");
  });

  it("Save patches the config; a fresh token rides the SEPARATE credentials mutation", async () => {
    hooks.update.mockImplementation((_vars, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    render(<DetailScreen serverId="github" />);
    await userEvent.type(screen.getByTestId(McpServerFormTestId.AuthToken), "gh-secret");
    await userEvent.click(screen.getByTestId(McpDetailScreenTestId.Save));

    expect(hooks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: "github" },
        body: expect.objectContaining({ command: "npx" }),
      }),
      expect.anything(),
    );
    // Never folded into the patch — persisted out-of-band.
    expect(JSON.stringify(hooks.update.mock.calls[0]![0])).not.toContain("gh-secret");
    expect(hooks.setCredentials).toHaveBeenCalledWith({
      params: { id: "github" },
      body: { authToken: "gh-secret" },
    });
  });

  it("Delete asks in a CONFIRM dialog, then deletes and navigates back to /mcp", async () => {
    hooks.del.mockImplementation((_args, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    render(<DetailScreen serverId="github" />);
    await userEvent.click(screen.getByTestId(McpDetailScreenTestId.Delete));
    expect(screen.getByText("Smazat MCP server?")).toBeInTheDocument();
    const confirm = screen
      .getAllByRole("button", { name: "Smazat" })
      .find((b) => b !== screen.getByTestId(McpDetailScreenTestId.Delete));
    await userEvent.click(confirm!);
    expect(hooks.del).toHaveBeenCalledWith(
      { params: { id: "github" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(push).toHaveBeenCalledWith("/mcp");
  });
});
