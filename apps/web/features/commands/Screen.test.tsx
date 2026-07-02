import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Command } from "@zibby/contracts";
import { Screen } from "./Screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const COMMANDS: Command[] = [
  {
    id: "orchestrate",
    description: "Orchestrates the thing",
    enabled: true,
    instructions: "Do the thing with $ARGUMENTS.",
  },
];

const { hooks } = vi.hoisted(() => ({
  hooks: {
    commands: { data: [] as unknown[], isPending: false, isError: false, refetch: vi.fn() },
    create: vi.fn(),
  },
}));

vi.mock("./queries", () => ({
  useCommandsQuery: () => hooks.commands,
}));
vi.mock("./mutations", () => ({
  useCreateCommandMutation: () => ({ mutate: hooks.create, isPending: false }),
}));

describe("commands Screen (N4d grammar)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.create.mockClear();
    hooks.commands = { data: COMMANDS, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("a tile click NAVIGATES to the command detail route — no dialog", async () => {
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Otevřít příkaz /orchestrate" }));
    expect(push).toHaveBeenCalledWith("/commands/orchestrate");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the header add action opens the CREATE-ONLY dialog (no edit/delete vocabulary)", async () => {
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Přidat příkaz" }));
    expect(screen.getByLabelText("Nový příkaz")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vytvořit příkaz" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Uložit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Smazat" })).toBeNull();
  });
});
