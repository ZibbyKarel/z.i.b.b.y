import { renderWithProviders as render, screen } from "../../../../test/render";
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
  it("pre-fills from the pipeline and PATCHes only the changed fields", async () => {
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

    // Pre-filled: name and the existing handoff (assignment file is internal).
    expect(screen.getByLabelText("Název pipeline")).toHaveValue("Delivery");
    expect(screen.getByLabelText("Předávací soubor")).toHaveValue("implementation.md");

    // Change ONLY the name.
    await userEvent.clear(screen.getByLabelText("Název pipeline"));
    await userEvent.type(screen.getByLabelText("Název pipeline"), "Delivery v2");
    await userEvent.click(screen.getByRole("button", { name: /Uložit změny/ }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [id, patch] = onSave.mock.calls[0] as [string, UpdatePipelineInput];
    expect(id).toBe("delivery");
    expect(patch).toEqual({ name: "Delivery v2" });
  });

  it("a phase change PATCHes phases (with original ids) and nothing else", async () => {
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

    const handoff = screen.getByLabelText("Předávací soubor");
    await userEvent.clear(handoff);
    await userEvent.type(handoff, "patch.diff");
    await userEvent.click(screen.getByRole("button", { name: /Uložit změny/ }));

    const [, patch] = onSave.mock.calls[0] as [string, UpdatePipelineInput];
    expect(Object.keys(patch)).toEqual(["phases"]);
    expect(patch.phases?.[0]).toMatchObject({ id: "koder", produces: "patch.diff" });
    // The verify phase kept its identity, commands and loop.
    expect(patch.phases?.[1]).toMatchObject({
      id: "verify",
      type: "verify",
      commands: ["pnpm test"],
      loop: { to: "koder", maxRetries: 2, escalate: true, then: "fail" },
    });
  });
});

describe("PipelineDialog — loop editor", () => {
  it("produces a schema-valid loop with then:'park' and escalation rungs", async () => {
    const onCreate = vi.fn();
    render(
      <PipelineDialog agents={agents} mode="create" onClose={() => {}} onCreate={onCreate} />,
    );

    await userEvent.type(screen.getByLabelText("Název pipeline"), "Smyčka");
    await userEvent.click(screen.getByRole("button", { name: "Přidat agenta" }));

    // Turn the loop on for phase 2 (defaults: to=phase-1, retries 3, then park).
    const loopToggles = screen.getAllByLabelText("Smyčka při selhání (back-edge)");
    await userEvent.click(loopToggles[1] as HTMLElement);
    // Add one escalation rung (defaults to opus/high).
    await userEvent.click(screen.getByRole("button", { name: /Přidat příčku/ }));

    await userEvent.click(screen.getByRole("button", { name: /Vytvořit pipeline/ }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const input = onCreate.mock.calls[0]?.[0] as CreatePipelineInput;
    expect(input.phases[1]?.loop).toEqual({
      to: "phase-1",
      maxRetries: 3,
      escalate: true,
      then: "park",
      escalation: [{ model: "opus", thinking: "high" }],
    });
    // The whole payload passes the contract schema (incl. the park literal).
    expect(CreatePipelineSchema.safeParse(input).success).toBe(true);
  });
});
