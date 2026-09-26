import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chain } from "@zibby/contracts";
import { ChainDetailScreen } from "./ChainDetailScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const CHAIN: Chain = {
  id: "dev-to-qa",
  label: "Dev to QA",
  description: "Hands work from dev to qa",
  entry: "dev",
  steps: [{ department: "qa", gate: "auto", ruleId: "rule-1" }],
  enabled: true,
};

const { hooks } = vi.hoisted(() => ({
  hooks: {
    chain: {
      data: undefined as Chain | undefined,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    putChain: vi.fn(),
    deleteChain: { mutate: vi.fn(), isError: false, error: null as unknown },
  },
}));

vi.mock("../queries", () => ({ useChainQuery: () => hooks.chain }));
vi.mock("../mutations", () => ({
  usePutChainMutation: () => ({ mutate: hooks.putChain, isPending: false }),
  useDeleteChainMutation: () => hooks.deleteChain,
}));

describe("ChainDetailScreen", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.putChain.mockClear();
    hooks.chain = { data: CHAIN, isPending: false, isError: false, refetch: vi.fn() };
    hooks.deleteChain = { mutate: vi.fn(), isError: false, error: null };
  });

  it("reads the chain's route and enabled state, with no editor visible", () => {
    render(<ChainDetailScreen chainId="dev-to-qa" />);
    expect(screen.getByText("Dev to QA")).toBeInTheDocument();
    expect(screen.getByText("Hands work from dev to qa")).toBeInTheDocument();
    expect(screen.queryByLabelText("Popis")).toBeNull();
  });

  it("Edit toggles the same page into the ChainEditor, and Save PUTs the edited input", async () => {
    render(<ChainDetailScreen chainId="dev-to-qa" />);
    await userEvent.click(screen.getByRole("button", { name: "Upravit" }));

    const labelInput = screen.getByLabelText("Název");
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, "Dev to QA v2");
    await userEvent.click(screen.getByRole("button", { name: "Uložit" }));

    expect(hooks.putChain).toHaveBeenCalledWith(
      {
        params: { id: "dev-to-qa" },
        body: {
          label: "Dev to QA v2",
          description: "Hands work from dev to qa",
          entry: "dev",
          steps: [{ department: "qa", gate: "auto" }],
          enabled: true,
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("delete confirms first, then routes back to the chain library on success", async () => {
    hooks.deleteChain.mutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    render(<ChainDetailScreen chainId="dev-to-qa" />);

    const deleteButton = screen.getByRole("button", { name: "Smazat" });
    await userEvent.click(deleteButton);
    await userEvent.click(screen.getByRole("button", { name: "Potvrdit smazání" }));

    expect(hooks.deleteChain.mutate).toHaveBeenCalledWith(
      { params: { id: "dev-to-qa" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(push).toHaveBeenCalledWith("/work/chains");
  });

  it("surfaces the server's 409 message inline when a parent task still walks the chain", () => {
    hooks.deleteChain = {
      mutate: vi.fn(),
      isError: true,
      error: { status: 409, body: { message: "A running task still walks this chain." } },
    };
    render(<ChainDetailScreen chainId="dev-to-qa" />);
    expect(screen.getByText("A running task still walks this chain.")).toBeInTheDocument();
  });
});
