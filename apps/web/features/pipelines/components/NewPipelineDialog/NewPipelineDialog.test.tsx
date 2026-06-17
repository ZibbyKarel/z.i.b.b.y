import { renderWithProviders as render, screen } from "../../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { type Agent, type CreatePipelineInput, CreatePipelineSchema } from "@zibby/contracts";
import { NewPipelineDialog } from "./NewPipelineDialog";

const agents: Agent[] = [
  { id: "writer", name: "Writer", glyph: "edit", instructions: "write" },
  { id: "tester", name: "Tester", glyph: "flask", instructions: "test" },
];

function setup(onCreate = vi.fn(), onClose = vi.fn()) {
  render(<NewPipelineDialog agents={agents} onClose={onClose} onCreate={onCreate} />);
  return { onCreate, onClose };
}

describe("NewPipelineDialog", () => {
  it("renders the labelled create dialog with an empty canvas", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Nová pipeline" })).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-canvas")).toBeInTheDocument();
    expect(screen.queryByTestId("pipeline-node")).toBeNull();
  });

  it("disables submit until both a name and a node exist", async () => {
    setup();
    const submit = screen.getByRole("button", { name: /Vytvořit pipeline/ });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Název pipeline"), "Release");
    // Name alone isn't enough — the chain needs a node.
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByTestId("palette-agent-writer"));
    expect(submit).toBeEnabled();
  });

  it("creates a schema-valid pipeline from a palette-added agent", async () => {
    const { onCreate } = setup();
    await userEvent.type(screen.getByLabelText("Název pipeline"), "Release vlak");
    await userEvent.click(screen.getByTestId("palette-agent-tester"));
    await userEvent.click(screen.getByRole("button", { name: /Vytvořit pipeline/ }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const input = onCreate.mock.calls[0]?.[0] as CreatePipelineInput;
    expect(input.id).toBe("release-vlak");
    expect(input.phases).toHaveLength(1);
    expect(input.phases[0]).toMatchObject({ type: "agent", agent: "tester", consumes: "task.md" });
    expect(CreatePipelineSchema.safeParse(input).success).toBe(true);
  });

  it("closes via the cancel action without creating", async () => {
    const { onCreate, onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Zrušit" }));
    expect(onClose).toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
