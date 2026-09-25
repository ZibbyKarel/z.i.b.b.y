import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChainNewScreen } from "./ChainNewScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { hooks } = vi.hoisted(() => ({ hooks: { putChain: vi.fn() } }));

vi.mock("../mutations", () => ({
  usePutChainMutation: () => ({ mutate: hooks.putChain, isPending: false }),
}));

describe("ChainNewScreen", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.putChain.mockClear();
  });

  it("submits a slugged id derived from the label, with the editor's default dev→qa route", async () => {
    render(<ChainNewScreen />);
    await userEvent.type(screen.getByLabelText("Název"), "Dev To QA");
    await userEvent.click(screen.getByRole("button", { name: "Vytvořit řetězec" }));

    expect(hooks.putChain).toHaveBeenCalledWith(
      {
        params: { id: "dev-to-qa" },
        body: {
          label: "Dev To QA",
          description: "",
          entry: "dev",
          steps: [{ department: "qa", gate: "auto" }],
          enabled: true,
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("navigates to the new chain's detail route on success", async () => {
    hooks.putChain.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    render(<ChainNewScreen />);
    await userEvent.type(screen.getByLabelText("Název"), "Dev To QA");
    await userEvent.click(screen.getByRole("button", { name: "Vytvořit řetězec" }));
    expect(push).toHaveBeenCalledWith("/work/chains/dev-to-qa");
  });
});
