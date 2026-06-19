import { renderWithProviders as render, screen, within } from "../../../../test/render";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  type Agent,
  type CreatePipelineInput,
  CreatePipelineSchema,
  type UpdatePipelineInput,
} from "@zibby/contracts";
import type { Pipeline } from "../../../../domain";
import { PipelineDialog } from "./PipelineDialog";

const agents: Agent[] = [
  { id: "writer", name: "Writer", glyph: "edit", instructions: "write" },
  { id: "tester", name: "Tester", glyph: "flask", instructions: "test" },
];

const existing: Pipeline = {
  id: "delivery",
  name: "Delivery",
  lastRun: "—",
  lastState: "done",
  desc: "build → verify",
  file: "f",
  outputs: [],
  phases: [
    {
      id: "koder",
      type: "agent",
      agent: "writer",
      consumes: "task.md",
      produces: "implementation.md",
      model: "sonnet",
      thinking: "medium",
    },
    {
      id: "verify",
      type: "verify",
      commands: ["pnpm test"],
      loop: { to: "koder", maxRetries: 2, escalate: true, then: "fail" },
    },
  ],
};

describe("PipelineDialog — edit mode", () => {
  it("pre-fills name and renders one node per phase from the graph", () => {
    render(
      <PipelineDialog
        agents={agents}
        initial={existing}
        mode="edit"
        onClose={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.getByLabelText("Název pipeline")).toHaveValue("Delivery");
    expect(screen.getAllByTestId("pipeline-node")).toHaveLength(2);
    // The hand-off filename rides the flow edge (koder → verify).
    expect(screen.getByLabelText("Název předávacího souboru")).toHaveValue("implementation.md");
  });

  it("PATCHes only the name when only the name changes", async () => {
    const onSave = vi.fn();
    render(
      <PipelineDialog
        agents={agents}
        initial={existing}
        mode="edit"
        onClose={() => {}}
        onSave={onSave}
      />,
    );
    await userEvent.clear(screen.getByLabelText("Název pipeline"));
    await userEvent.type(screen.getByLabelText("Název pipeline"), "Delivery v2");
    await userEvent.click(screen.getByRole("button", { name: /Uložit změny/ }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [id, patch] = onSave.mock.calls[0] as [string, UpdatePipelineInput];
    expect(id).toBe("delivery");
    expect(patch).toEqual({ name: "Delivery v2" });
  });

  it("editing the hand-off file PATCHes phases keeping original ids + the verify loop", async () => {
    const onSave = vi.fn();
    render(
      <PipelineDialog
        agents={agents}
        initial={existing}
        mode="edit"
        onClose={() => {}}
        onSave={onSave}
      />,
    );
    const handoff = screen.getByLabelText("Název předávacího souboru");
    await userEvent.clear(handoff);
    await userEvent.type(handoff, "patch.diff");
    await userEvent.click(screen.getByRole("button", { name: /Uložit změny/ }));

    const [, patch] = onSave.mock.calls[0] as [string, UpdatePipelineInput];
    expect(Object.keys(patch)).toEqual(["phases"]);
    expect(patch.phases?.[0]).toMatchObject({ id: "koder", produces: "patch.diff" });
    expect(patch.phases?.[1]).toMatchObject({
      id: "verify",
      type: "verify",
      commands: ["pnpm test"],
      loop: { to: "koder", maxRetries: 2, escalate: true, then: "fail" },
    });
  });
});

describe("PipelineDialog — create mode", () => {
  it("adds a node from the palette and creates a schema-valid pipeline", async () => {
    const onCreate = vi.fn();
    render(<PipelineDialog agents={agents} mode="create" onClose={() => {}} onCreate={onCreate} />);

    await userEvent.type(screen.getByLabelText("Název pipeline"), "Doručení");
    await userEvent.click(screen.getByTestId("palette-agent-writer"));
    expect(screen.getByTestId("pipeline-node")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Vytvořit pipeline/ }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const input = onCreate.mock.calls[0]?.[0] as CreatePipelineInput;
    expect(input.id).toBe("doruceni");
    expect(input.phases).toHaveLength(1);
    expect(input.phases[0]).toMatchObject({ type: "agent", agent: "writer", consumes: "task.md" });
    expect(CreatePipelineSchema.safeParse(input).success).toBe(true);
  });

  it("cannot submit with no nodes", () => {
    render(<PipelineDialog agents={agents} mode="create" onClose={() => {}} onCreate={() => {}} />);
    expect(screen.getByRole("button", { name: /Vytvořit pipeline/ })).toBeDisabled();
  });

  it("wires a flow edge by dragging output → input, exposing the hand-off file", async () => {
    render(<PipelineDialog agents={agents} mode="create" onClose={() => {}} onCreate={() => {}} />);
    await userEvent.type(screen.getByLabelText("Název pipeline"), "Chain");
    await userEvent.click(screen.getByTestId("palette-agent-writer"));
    await userEvent.click(screen.getByTestId("palette-agent-tester"));

    const nodes = screen.getAllByTestId("pipeline-node");
    const outPort = within(nodes[0] as HTMLElement).getByTestId("node-port-out");
    const inPort = within(nodes[1] as HTMLElement).getByTestId("node-port-in");

    fireEvent.mouseDown(outPort);
    fireEvent.mouseEnter(inPort);
    fireEvent.mouseUp(window);

    expect(screen.getByTestId("flow-file-control")).toBeInTheDocument();
  });
});
