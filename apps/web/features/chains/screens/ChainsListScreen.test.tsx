import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chain } from "@zibby/contracts";
import { TagTestId } from "@zibby/design-system";
import { ChainsListScreen } from "./ChainsListScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const CHAINS: Chain[] = [
  {
    id: "dev-to-qa",
    label: "Dev to QA",
    description: "Hands work from dev to qa",
    entry: "dev",
    steps: [{ department: "qa", gate: "auto", ruleId: "rule-1" }],
    enabled: true,
  },
];

const { hooks } = vi.hoisted(() => ({
  hooks: { chains: { data: [] as Chain[], isPending: false, isError: false, refetch: vi.fn() } },
}));

vi.mock("../queries", () => ({ useChainsQuery: () => hooks.chains }));

describe("ChainsListScreen", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.chains = { data: CHAINS, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("lists a chain by label with its enabled tag and a '—' in-flight count", () => {
    render(<ChainsListScreen />);
    expect(screen.getByText("Dev to QA")).toBeInTheDocument();
    expect(screen.getByTestId(TagTestId.Root)).toHaveTextContent("Zapnuto");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("a row click navigates to the chain's detail route", async () => {
    render(<ChainsListScreen />);
    await userEvent.click(screen.getByText("Dev to QA"));
    expect(push).toHaveBeenCalledWith("/work/chains/dev-to-qa");
  });

  it("the header action navigates to the new-chain route", async () => {
    render(<ChainsListScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Nový řetězec" }));
    expect(push).toHaveBeenCalledWith("/work/chains/new");
  });

  it("shows an empty state when there are no chains", () => {
    hooks.chains = { data: [], isPending: false, isError: false, refetch: vi.fn() };
    render(<ChainsListScreen />);
    expect(screen.getByText("Zatím žádné řetězce")).toBeInTheDocument();
  });
});
