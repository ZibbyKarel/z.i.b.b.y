import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@zibby/contracts";
import { Screen } from "./Screen";
import { McpServerFormTestId } from "./components/McpServerFormDialog";

const server: McpServer = {
  id: "github",
  type: "stdio",
  name: "GitHub",
  command: "npx",
  args: ["-y", "server-github"],
  enabled: true,
  hasCredentials: true,
};

const createMutate = vi.fn();
const setCredentialsMutate = vi.fn();
let listData: McpServer[] = [];

vi.mock("./queries", () => ({
  useMcpServersQuery: () => ({ data: listData }),
}));

vi.mock("./mutations", () => ({
  useCreateMcpServerMutation: () => ({ mutate: createMutate, isPending: false }),
  useUpdateMcpServerMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMcpServerMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSetMcpCredentialsMutation: () => ({ mutate: setCredentialsMutate, isPending: false }),
}));

beforeEach(() => {
  createMutate.mockReset();
  setCredentialsMutate.mockReset();
  listData = [];
});

describe("MCP Screen", () => {
  it("renders the server list", () => {
    listData = [server];
    render(<Screen />);
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });

  it("creates a server then persists the token via the credentials mutation", async () => {
    createMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    listData = [server]; // non-empty so only the toolbar add button renders
    render(<Screen />);

    await userEvent.click(screen.getByText("Přidat MCP server"));
    await userEvent.type(screen.getByTestId(McpServerFormTestId.Id), "linear");
    await userEvent.type(screen.getByTestId(McpServerFormTestId.Command), "npx");
    await userEvent.type(screen.getByTestId(McpServerFormTestId.AuthToken), "lin-secret");
    await userEvent.click(screen.getByTestId(McpServerFormTestId.Submit));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const createBody = createMutate.mock.calls[0]![0].body;
    expect(createBody.id).toBe("linear");
    expect(JSON.stringify(createBody)).not.toContain("lin-secret");

    // Token persisted through the SEPARATE credentials mutation, as an authToken.
    expect(setCredentialsMutate).toHaveBeenCalledTimes(1);
    expect(setCredentialsMutate.mock.calls[0]![0]).toEqual({
      params: { id: "linear" },
      body: { authToken: "lin-secret" },
    });
  });
});
