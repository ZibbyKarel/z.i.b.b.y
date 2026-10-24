import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders as render, screen } from "../../../test/render";
import { InventoryScreen, InventoryScreenTestId } from "./InventoryScreen";

const refetch = vi.fn();
const mutate = vi.fn();
let inventory: unknown;
let mutation: Record<string, unknown>;

vi.mock("../queries", () => ({
  useInventoryQuery: () => ({
    data: inventory,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch,
  }),
}));
vi.mock("../mutations", () => ({
  useInstallSkillMutation: () => ({ mutate, isPending: false, isError: false, ...mutation }),
}));

const full = {
  catalog: [
    { skillId: "a", name: "Alpha", status: "not-installed" },
    { skillId: "b", name: "Beta", status: "outdated" },
    { skillId: "c", name: "Gamma", status: "conflict" },
    { skillId: "d", name: "Delta", status: "installed" },
  ],
  mcp: [{ name: "gh", scope: "user", transport: "stdio", target: "npx-bin" }],
  skills: [{ id: "s", name: "zskill", source: "user", zibbyManaged: true }],
  plugins: [{ id: "pl@m", version: "1.0", enabled: true, skillCount: 2, mcpCount: 1 }],
};

beforeEach(() => {
  inventory = full;
  mutation = {};
  mutate.mockReset();
  refetch.mockReset();
});

describe("InventoryScreen", () => {
  it("renders four sections in order", () => {
    render(<InventoryScreen />);
    const els = [
      InventoryScreenTestId.Catalog,
      InventoryScreenTestId.Mcp,
      InventoryScreenTestId.Skills,
      InventoryScreenTestId.Plugins,
    ].map((id) => screen.getByTestId(id));
    for (let i = 1; i < els.length; i++) {
      expect(
        els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("shows status badges and actions per catalog status", () => {
    render(<InventoryScreen />);
    expect(screen.getByText("Nenainstalováno")).toBeTruthy();
    expect(screen.getByText("Zastaralé")).toBeTruthy();
    expect(screen.getByText("Konflikt")).toBeTruthy();
    expect(screen.getByText("Nainstalováno")).toBeTruthy();
    const buttons = screen.getAllByTestId(InventoryScreenTestId.Install);
    expect(buttons.map((b) => b.textContent)).toEqual(["Nainstalovat", "Aktualizovat"]);
    expect(screen.getByText(/nespravuje ZIBBY/)).toBeTruthy();
  });

  it("install calls the mutation with the skill id", () => {
    render(<InventoryScreen />);
    fireEvent.click(screen.getAllByTestId(InventoryScreenTestId.Install)[0]!);
    expect(mutate).toHaveBeenCalledWith({ params: { skillId: "a" }, body: {} });
  });

  it("disables the button while pending", () => {
    mutation = { isPending: true, variables: { params: { skillId: "a" } } };
    render(<InventoryScreen />);
    const [first, second] = screen.getAllByTestId(
      InventoryScreenTestId.Install,
    ) as HTMLButtonElement[];
    expect(first!.disabled).toBe(true);
    expect(second!.disabled).toBe(false);
  });

  it("renders a row error on mutation failure", () => {
    mutation = {
      isError: true,
      variables: { params: { skillId: "a" } },
      error: { body: { message: "boom" } },
    };
    render(<InventoryScreen />);
    expect(screen.getByTestId(InventoryScreenTestId.RowError).textContent).toBe("boom");
  });

  it("shows target, ZIBBY tag and plugin id", () => {
    render(<InventoryScreen />);
    expect(screen.getByText("npx-bin")).toBeTruthy();
    expect(screen.getByText("ZIBBY")).toBeTruthy();
    expect(screen.getByText("pl@m")).toBeTruthy();
  });

  it("shows the empty line for empty sections", () => {
    inventory = { catalog: [], mcp: [], skills: [], plugins: [] };
    render(<InventoryScreen />);
    expect(screen.getAllByText("Nic nenalezeno.")).toHaveLength(4);
  });

  it("refresh refetches", () => {
    render(<InventoryScreen />);
    fireEvent.click(screen.getByTestId(InventoryScreenTestId.Refresh));
    expect(refetch).toHaveBeenCalled();
  });
});
