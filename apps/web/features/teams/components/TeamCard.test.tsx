import type { Team } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { TeamCard } from "./TeamCard";

const team = (over: Partial<Team> = {}): Team => ({
  id: "platform",
  name: "Platform",
  ...over,
});

describe("TeamCard", () => {
  it("renders the team name and description", () => {
    render(<TeamCard team={team({ desc: "Core infra" })} />);
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("Core infra")).toBeInTheDocument();
  });

  it("shows the knowledge-base badge when a KB is attached", () => {
    render(
      <TeamCard
        team={team({ knowledgeBase: { kind: "vault", path: "/tmp/kb", readOnly: true } })}
      />,
    );
    expect(screen.getByText("znalostní báze")).toBeInTheDocument();
  });

  it("hides the knowledge-base badge when there is none", () => {
    render(<TeamCard team={team()} />);
    expect(screen.queryByText("znalostní báze")).not.toBeInTheDocument();
  });

  it("calls onOpen with the team when clicked", () => {
    const onOpen = vi.fn();
    render(<TeamCard onOpen={onOpen} team={team()} />);
    screen.getByLabelText("Otevřít Platform").click();
    expect(onOpen).toHaveBeenCalledWith(team());
  });
});
