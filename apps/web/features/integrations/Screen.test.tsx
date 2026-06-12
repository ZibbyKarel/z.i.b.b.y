import { renderWithProviders as render, screen, waitFor } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Integration } from "@zibby/contracts";
import { Screen } from "./Screen";
import { IntegrationFormTestId } from "./components/IntegrationFormDialog";

/**
 * The screen wires the query + mutations. We mock both layers so the create →
 * credentials handoff and the test-connection feedback are exercised without a
 * backend. The key assertion is Law-3-shaped: the secret travels through the
 * SEPARATE credentials mutation, never folded into the create body.
 */

const slack: Integration = {
  id: "team-slack",
  kind: "slack",
  name: "Team Slack",
  enabled: true,
  config: { kind: "slack", channels: ["C1"] },
  status: "disconnected",
  hasCredentials: true,
};

const createMutate = vi.fn();
const setCredentialsMutate = vi.fn();
const testMutate = vi.fn();
let listData: Integration[] = [];

vi.mock("./queries", () => ({
  useIntegrationsQuery: () => ({ data: listData }),
}));

vi.mock("./mutations", () => ({
  useCreateIntegrationMutation: () => ({ mutate: createMutate, isPending: false }),
  useUpdateIntegrationMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSetCredentialsMutation: () => ({ mutate: setCredentialsMutate, isPending: false }),
  useTestIntegrationMutation: () => ({ mutate: testMutate, isPending: false }),
}));

beforeEach(() => {
  createMutate.mockReset();
  setCredentialsMutate.mockReset();
  testMutate.mockReset();
  listData = [];
})

describe("Integrations Screen", () => {
  it("creates an integration then persists the secret via the credentials mutation", async () => {
    // Create echoes success so the screen runs its onSuccess (secret persist).
    createMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    listData = [slack]; // a non-empty list, so only the toolbar "add" button renders
    render(<Screen />);

    await userEvent.click(screen.getByText("Přidat integraci"));
    await userEvent.type(screen.getByTestId("integration-id"), "team-slack");
    await userEvent.type(screen.getByTestId(IntegrationFormTestId.Secret), "xoxb-1");
    await userEvent.click(screen.getByTestId(IntegrationFormTestId.Submit));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const createBody = createMutate.mock.calls[0]![0].body;
    expect(createBody.id).toBe("team-slack");
    expect(JSON.stringify(createBody)).not.toContain("xoxb-1");

    // Secret persisted through the SEPARATE credentials mutation, as a slack token.
    expect(setCredentialsMutate).toHaveBeenCalledTimes(1);
    expect(setCredentialsMutate.mock.calls[0]![0]).toEqual({
      params: { id: "team-slack" },
      body: { token: "xoxb-1" },
    });
  });

  it("renders the test-connection result detail", async () => {
    listData = [slack];
    testMutate.mockImplementation((_vars, opts) =>
      opts?.onSuccess?.({ body: { ok: true, detail: "slack ok" } }),
    );
    render(<Screen />);

    await userEvent.click(screen.getByText("Test spojení"));

    expect(testMutate).toHaveBeenCalledWith(
      { params: { id: "team-slack" }, body: {} },
      expect.any(Object),
    );
    await waitFor(() =>
      expect(screen.getByTestId("integration-test-result")).toHaveTextContent("slack ok"),
    );
  });
})
