import { renderWithProviders as render, screen } from "../../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Agent, CreatePipelineInput } from "@zibby/contracts";
import { NewPipelineDialog } from "./NewPipelineDialog";

const agents: Agent[] = [
  { id: "writer", name: "Writer", glyph: "edit", instructions: "write" },
  { id: "tester", name: "Tester", glyph: "flask", instructions: "test" },
];

function setup(onCreate = vi.fn(), onClose = vi.fn()) {
  render(
    <NewPipelineDialog agents={agents} onClose={onClose} onCreate={onCreate} />,
  );
  return { onCreate, onClose };
}

describe("NewPipelineDialog", () => {
  it("renders a labelled dialog with one seeded phase", () => {
    setup();
    expect(
      screen.getByRole("dialog", { name: "Nová pipeline" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Soubor s prvním zadáním")).toHaveValue(
      "task.md",
    );
    expect(screen.getAllByLabelText("Předávací soubor")).toHaveLength(1);
  });

  it("disables submit until a name is given", async () => {
    setup();
    const submit = screen.getByRole("button", { name: /Vytvořit pipeline/ });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Název pipeline"), "Release");
    expect(submit).toBeEnabled();
  });

  it("creates a one-way chain: each phase consumes the previous handoff", async () => {
    const { onCreate } = setup();
    await userEvent.type(
      screen.getByLabelText("Název pipeline"),
      "Release vlak",
    );
    await userEvent.click(screen.getByRole("button", { name: "Přidat agenta" }));

    // Rename phase 1's handoff — phase 2's assignment must follow it.
    const handoffs = screen.getAllByLabelText("Předávací soubor");
    expect(handoffs).toHaveLength(2);
    await userEvent.clear(handoffs[0] as HTMLElement);
    await userEvent.type(handoffs[0] as HTMLElement, "review.md");

    await userEvent.click(
      screen.getByRole("button", { name: /Vytvořit pipeline/ }),
    );

    expect(onCreate).toHaveBeenCalledTimes(1);
    const input = onCreate.mock.calls[0]?.[0] as CreatePipelineInput;
    expect(input.id).toBe("release-vlak");
    expect(input.phases).toEqual([
      {
        id: "phase-1",
        agent: "writer",
        consumes: "task.md",
        produces: "review.md",
        model: "sonnet",
        thinking: "medium",
      },
      {
        id: "phase-2",
        agent: "writer",
        consumes: "review.md",
        produces: "handoff-2.md",
        model: "sonnet",
        thinking: "medium",
      },
    ]);
  });

  it("picks a different agent for a phase via the agent select", async () => {
    const { onCreate } = setup();
    await userEvent.type(screen.getByLabelText("Název pipeline"), "QA");

    await userEvent.click(screen.getByLabelText("Agent"));
    await userEvent.click(screen.getByRole("option", { name: "Tester" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Vytvořit pipeline/ }),
    );

    const input = onCreate.mock.calls[0]?.[0] as CreatePipelineInput;
    expect(input.phases[0]?.agent).toBe("tester");
  });

  it("removes a phase and re-links the chain", async () => {
    const { onCreate } = setup();
    await userEvent.type(screen.getByLabelText("Název pipeline"), "Chain");
    await userEvent.click(screen.getByRole("button", { name: "Přidat agenta" }));
    await userEvent.click(screen.getByRole("button", { name: "Přidat agenta" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Odebrat fázi 2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Vytvořit pipeline/ }),
    );

    const input = onCreate.mock.calls[0]?.[0] as CreatePipelineInput;
    expect(input.phases.map((p) => p.id)).toEqual(["phase-1", "phase-2"]);
    expect(input.phases[1]?.consumes).toBe(input.phases[0]?.produces);
  });

  it("closes via the cancel action without creating", async () => {
    const { onCreate, onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Zrušit" }));
    expect(onClose).toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
