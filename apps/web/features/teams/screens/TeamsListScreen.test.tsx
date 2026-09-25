import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Team } from "@zibby/contracts";
import { TeamsListScreen } from "./TeamsListScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const TEAMS: Team[] = [{ id: "platform", name: "Platform", desc: "Core infra" }];

const { hooks } = vi.hoisted(() => ({
  hooks: {
    teams: { data: [] as Team[], isPending: false, isError: false, refetch: vi.fn() },
  },
}));

vi.mock("../queries", () => ({
  useTeamsQuery: () => hooks.teams,
}));

describe("TeamsListScreen (ZB-06)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.teams = { data: TEAMS, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("renders a card per team", () => {
    render(<TeamsListScreen />);
    expect(screen.getByText("Platform")).toBeInTheDocument();
  });

  it("a card click navigates to the /work/teams detail route", async () => {
    render(<TeamsListScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Otevřít Platform" }));
    expect(push).toHaveBeenCalledWith("/work/teams/platform");
  });

  it("the header add action navigates to /work/teams/new", async () => {
    render(<TeamsListScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Přidat tým" }));
    expect(push).toHaveBeenCalledWith("/work/teams/new");
  });

  it("shows the empty state when there are no teams", () => {
    hooks.teams = { data: [], isPending: false, isError: false, refetch: vi.fn() };
    render(<TeamsListScreen />);
    expect(screen.getByText("Zatím žádné týmy")).toBeInTheDocument();
  });
});
