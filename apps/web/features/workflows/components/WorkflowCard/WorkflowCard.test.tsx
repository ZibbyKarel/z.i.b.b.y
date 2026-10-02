import { renderWithProviders as render, screen } from "../../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Agent } from "@zibby/contracts";
import { IconTileTestId } from "@zibby/design-system";
import type { Workflow } from "../../../../domain";
import { WorkflowCard } from "./WorkflowCard";
import { WorkflowOwnerChipTestId } from "./WorkflowOwnerChip";

const agents: Agent[] = [
  {
    id: "architect",
    name: "Architekt",
    glyph: "compass",
    model: "opus",
    thinking: "high",
    tools: [],
    instructions: "x",
  },
];

const workflow: Workflow = {
  id: "build-feature",
  name: "Build Feature",
  lastRun: "dnes 03:12",
  lastState: "parked",
  desc: "spec → impl → test",
  file: "f",
  outputs: [],
  phases: [
    {
      type: "agent" as const,
      agent: "Architekt",
      consumes: "task.md",
      produces: "design.md",
      model: "opus" as const,
      thinking: "high" as const,
    },
  ],
};

describe("WorkflowCard", () => {
  it("renders name, state label and last run", () => {
    render(
      <WorkflowCard agents={agents} onSelect={() => {}} selected={false} workflow={workflow} />,
    );
    expect(screen.getByText("Build Feature")).toBeInTheDocument();
    expect(screen.getByText("zaparkováno")).toBeInTheDocument();
    expect(screen.getByText(/dnes 03:12/)).toBeInTheDocument();
  });

  it("selects on click", async () => {
    const onSelect = vi.fn();
    render(
      <WorkflowCard agents={agents} onSelect={onSelect} selected={false} workflow={workflow} />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("build-feature");
  });

  it("renders the workflow avatar over the glyph", () => {
    render(
      <WorkflowCard
        agents={agents}
        onSelect={() => {}}
        selected={false}
        workflow={{ ...workflow, avatar: "/avatars/orchestrator.png" }}
      />,
    );
    expect(screen.getByTestId(IconTileTestId.Image)).toHaveAttribute(
      "src",
      "/avatars/orchestrator.png",
    );
  });

  it("shows an owner chip for a tagged workflow, none for an untagged one (Phase 85)", () => {
    const { rerender } = render(
      <WorkflowCard
        agents={agents}
        onSelect={() => {}}
        selected={false}
        workflow={{ ...workflow, department: "dev" }}
      />,
    );
    expect(screen.getByTestId(WorkflowOwnerChipTestId.Root)).toHaveTextContent("Dev");

    rerender(
      <WorkflowCard agents={agents} onSelect={() => {}} selected={false} workflow={workflow} />,
    );
    expect(screen.queryByTestId(WorkflowOwnerChipTestId.Root)).toBeNull();
  });
});
