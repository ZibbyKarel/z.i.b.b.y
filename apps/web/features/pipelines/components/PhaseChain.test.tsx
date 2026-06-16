import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it } from "vitest";
import type { Pipeline } from "../../../domain";
import { PhaseChain } from "./PhaseChain";

const pipeline: Pipeline = {
  id: "delivery",
  name: "Delivery",
  lastRun: "—",
  lastState: "done",
  desc: "build → verify",
  file: "f",
  outputs: [],
  phases: [
    {
      type: "agent",
      agent: "Kodér",
      consumes: "task.md",
      produces: "implementation.md",
      model: "sonnet",
      thinking: "medium",
    },
    {
      type: "verify",
      commands: ["pnpm lint", "pnpm test"],
    },
  ],
};

describe("PhaseChain — attempt counts", () => {
  const looped: Pipeline = {
    ...pipeline,
    phases: [
      { ...pipeline.phases[0]!, id: "koder" },
      {
        ...pipeline.phases[1]!,
        id: "verify",
        loop: { to: "koder", maxRetries: 2, escalate: true, then: "park" },
      },
    ],
  };

  it("shows 'attempt n/m' on the looped node when a current run is supplied", () => {
    render(
      <PhaseChain
        agents={[]}
        attempts={{ koder: 2, verify: 2 }}
        pipeline={looped}
      />,
    );
    // Only the looped node renders the counter (max = maxRetries + 1).
    expect(screen.getByText("pokus 2/3")).toBeInTheDocument();
  });

  it("renders no counter without a current run", () => {
    render(<PhaseChain agents={[]} pipeline={looped} />);
    expect(screen.queryByText(/pokus/)).not.toBeInTheDocument();
  });
});

describe("PhaseChain — verify node", () => {
  it("renders a verify phase with the checks list instead of agent badges", () => {
    render(<PhaseChain agents={[]} pipeline={pipeline} />);
    // The agent node keeps its identity…
    expect(screen.getByText("Kodér")).toBeInTheDocument();
    // …the verify node gets the distinct label + its commands.
    expect(screen.getByText("verify")).toBeInTheDocument();
    expect(screen.getByText("kontroly")).toBeInTheDocument();
    expect(screen.getByText("pnpm lint")).toBeInTheDocument();
    expect(screen.getByText("pnpm test")).toBeInTheDocument();
    // No model/thinking badges on the verify node (one pair only — the agent's).
    expect(screen.getAllByText(/sonnet/)).toHaveLength(1);
  });
});
