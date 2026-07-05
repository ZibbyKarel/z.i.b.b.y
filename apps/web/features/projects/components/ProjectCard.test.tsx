import type { Project, ProjectBudgetStatus } from "@zibby/contracts";
import { IconTileTestId } from "@zibby/design-system";
import { describe, expect, it } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { ProjectCard } from "./ProjectCard";

const project = (over: Partial<Project> = {}): Project => ({
  id: "alpha",
  name: "Alpha",
  path: "~/Projects/alpha",
  ...over,
});

const status = (over: Partial<ProjectBudgetStatus> = {}): ProjectBudgetStatus => ({
  projectId: "alpha",
  name: "Alpha",
  daily: { used: 1, cap: 2 },
  weekly: { used: 1 },
  running: 1,
  queued: 0,
  held: 0,
  ...over,
});

describe("ProjectCard budget", () => {
  it("shows the daily run-count bar with used/cap when a budget is set", () => {
    render(<ProjectCard budget={status()} project={project({ budget: { dailyRuns: 2 } })} />);
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("hides budget bars entirely when the project has no budget", () => {
    render(<ProjectCard budget={undefined} project={project()} />);
    expect(screen.queryByText(/\/2$/)).not.toBeInTheDocument();
  });

  it("surfaces a held count when the engagement has tasks held over budget", () => {
    render(
      <ProjectCard budget={status({ held: 2 })} project={project({ budget: { dailyRuns: 1 } })} />,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

describe("ProjectCard cost bars (Phase 12)", () => {
  it("shows the daily cost bar with spent/cap when a dollar cap is set", () => {
    render(
      <ProjectCard
        budget={status({ dailyCost: { spentUsd: 1.5, capUsd: 5 } })}
        project={project({ budget: { dailyCostCapUsd: 5 } })}
      />,
    );
    expect(screen.getByText("$1.50 / $5.00")).toBeInTheDocument();
  });

  it("hides a cost bar when its window has no dollar cap set (even with spend > 0)", () => {
    render(
      <ProjectCard
        budget={status({ dailyCost: { spentUsd: 1.5 } })}
        project={project({ budget: { dailyRuns: 2 } })}
      />,
    );
    expect(screen.queryByText(/\$1\.50/)).not.toBeInTheDocument();
  });

  it("hides all cost bars entirely when the project has no budget", () => {
    render(<ProjectCard budget={undefined} project={project()} />);
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
  });
});

describe("ProjectCard logo", () => {
  it("renders the project's custom logo when set", () => {
    render(<ProjectCard project={project({ logo: "data:image/png;base64,AAA" })} />);
    const img = screen.getByTestId(IconTileTestId.Image);
    expect(img).toHaveAccessibleName("Alpha");
    expect(img).toHaveAttribute("src", "data:image/png;base64,AAA");
  });

  it("falls back to the code glyph when the project has no logo", () => {
    render(<ProjectCard project={project()} />);
    expect(screen.queryByTestId(IconTileTestId.Image)).toBeNull();
  });
});
