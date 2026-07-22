import type { HandoffRule } from "@zibby/contracts";
import { DropdownTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { HandoffRuleModal } from "./HandoffRuleModal";

const subsystems = [
  { id: "forge", name: "Forge" },
  { id: "sentinel", name: "Sentinel" },
];
const pipelines = [{ id: "hotfix", name: "Hotfix" }];

describe("HandoffRuleModal (P2)", () => {
  it("create mode submits an input without id and without system", async () => {
    const onSave = vi.fn();
    render(
      <HandoffRuleModal
        fromSubsystemId="forge"
        onClose={vi.fn()}
        onSave={onSave}
        pipelines={pipelines}
        subsystemName="Forge"
        subsystems={subsystems}
      />,
    );

    expect(screen.getByText("Nové pravidlo předávání")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Druh signálu"), "cve");

    await userEvent.click(screen.getByLabelText("Konkrétní cíl"));
    const target = screen
      .getAllByTestId(DropdownTestId.Option)
      .find((el) => el.textContent === "Sentinel");
    await userEvent.click(target!);

    await userEvent.click(screen.getByRole("button", { name: "Uložit pravidlo" }));

    expect(onSave).toHaveBeenCalledWith({
      from: "forge",
      signalKind: "cve",
      to: { kind: "subsystem", id: "sentinel" },
      tier: 2,
      enabled: true,
    });
    const [input] = onSave.mock.calls[0]!;
    expect(input).not.toHaveProperty("id");
    expect(input).not.toHaveProperty("system");
  });

  it("edit mode prefills every field from the initial rule", () => {
    const initial: HandoffRule = {
      id: "hr-1",
      from: "forge",
      signalKind: "post-merge-red",
      minSeverity: "high",
      to: { kind: "subsystem", id: "sentinel" },
      tier: 3,
      enabled: false,
    };
    render(
      <HandoffRuleModal
        fromSubsystemId="forge"
        initial={initial}
        onClose={vi.fn()}
        onSave={vi.fn()}
        pipelines={pipelines}
        subsystemName="Forge"
        subsystems={subsystems}
      />,
    );

    expect(screen.getByText("Upravit pravidlo předávání")).toBeInTheDocument();
    expect(screen.getByLabelText("Druh signálu")).toHaveValue("post-merge-red");
    expect(screen.getByLabelText("Min. závažnost")).toHaveTextContent("vysoká");
    expect(screen.getByLabelText("Konkrétní cíl")).toHaveTextContent("Sentinel");
    expect(screen.getByLabelText("Tier")).toHaveTextContent("Tier 3");
  });

  it("switching the target kind swaps the id options between subsystem and pipeline", async () => {
    render(
      <HandoffRuleModal
        fromSubsystemId="forge"
        onClose={vi.fn()}
        onSave={vi.fn()}
        pipelines={pipelines}
        subsystemName="Forge"
        subsystems={subsystems}
      />,
    );

    await userEvent.click(screen.getByLabelText("Konkrétní cíl"));
    let optionLabels = screen.getAllByTestId(DropdownTestId.Option).map((el) => el.textContent);
    expect(optionLabels).toEqual(["Forge", "Sentinel"]);
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "Pipeline" }));

    await userEvent.click(screen.getByLabelText("Konkrétní cíl"));
    optionLabels = screen.getAllByTestId(DropdownTestId.Option).map((el) => el.textContent);
    expect(optionLabels).toEqual(["Hotfix"]);
  });
});
