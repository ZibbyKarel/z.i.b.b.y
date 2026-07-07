import { renderWithProviders as render, screen, within } from "../../../../test/render";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { type Agent, type CreatePipelineInput, CreatePipelineSchema } from "@zibby/contracts";
import { PipelineDialog } from "./PipelineDialog";

const agents: Agent[] = [
  { id: "writer", name: "Writer", glyph: "edit", instructions: "write" },
  { id: "tester", name: "Tester", glyph: "flask", instructions: "test" },
];

// Edit mode moved inline into the pipeline detail view (Screen.tsx) — see
// `Screen.test.tsx` for those cases. `PipelineDialog` is create-only now,
// though it still accepts `mode`/`initial`/`onSave` (kept for the type, unused
// by any current caller) so a future edit-dialog resurrection isn't blocked.

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
