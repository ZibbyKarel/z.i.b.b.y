import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Team } from "@zibby/contracts";
import { Screen } from "./Screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const TEAMS: Team[] = [{ id: "platform", name: "Platform", desc: "Core infra" }];

const { hooks } = vi.hoisted(() => ({
  hooks: {
    teams: { data: [] as Team[], isPending: false, isError: false, refetch: vi.fn() },
  },
}));

vi.mock("./queries", () => ({
  useTeamsQuery: () => hooks.teams,
}));

describe("teams Screen", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.teams = { data: TEAMS, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("renders a card per team", () => {
    render(<Screen />);
    expect(screen.getByText("Platform")).toBeInTheDocument();
  });

  it("a card click navigates to the team detail route", async () => {
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Otevřít Platform" }));
    expect(push).toHaveBeenCalledWith("/teams/platform");
  });

  it("the header add action navigates to /teams/new", async () => {
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Přidat tým" }));
    expect(push).toHaveBeenCalledWith("/teams/new");
  });

  it("shows the empty state when there are no teams", () => {
    hooks.teams = { data: [], isPending: false, isError: false, refetch: vi.fn() };
    render(<Screen />);
    expect(screen.getByText("Zatím žádné týmy")).toBeInTheDocument();
  });

  it("shows the loading state while pending", () => {
    hooks.teams = { data: [], isPending: true, isError: false, refetch: vi.fn() };
    render(<Screen />);
    expect(screen.queryByText("Zatím žádné týmy")).not.toBeInTheDocument();
  });

  it("shows the error state and retries", async () => {
    const refetch = vi.fn();
    hooks.teams = { data: [], isPending: false, isError: true, refetch };
    render(<Screen />);
    const retry = screen.getByRole("button", { name: /Zkusit|znovu|Opakovat/i });
    await userEvent.click(retry);
    expect(refetch).toHaveBeenCalled();
  });
});
