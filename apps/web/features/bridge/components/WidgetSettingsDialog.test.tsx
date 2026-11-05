import { ConfirmDeleteButtonTestId } from "@zibby/design-system";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import type { WidgetSettingsProps } from "../widgets/registry";
import { WidgetSettingsDialog, WidgetSettingsDialogTestId } from "./WidgetSettingsDialog";

vi.mock("../widgets/registry", () => ({
  WIDGETS: {
    prs: { labelKey: "bridge.widget.prs.label" },
    teamKb: {
      labelKey: "bridge.widget.teamKb.label",
      Settings: ({ draft, onChange }: WidgetSettingsProps) => (
        <button onClick={() => onChange({ ...draft, scope: { teamId: "sales" } })} type="button">
          pick
        </button>
      ),
    },
  },
}));

const prs: BridgeWidget = { id: "prs-2", type: "prs", x: 0, y: 0, w: 4, h: 6, title: "Old" };

const open = (widget: BridgeWidget = prs) => {
  const p = { onSave: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() };
  renderWithProviders(<WidgetSettingsDialog widget={widget} {...p} />);
  return p;
};
const name = () => screen.getByTestId(WidgetSettingsDialogTestId.Name);

describe("WidgetSettingsDialog", () => {
  it("rename saves the trimmed title and closes", () => {
    const p = open();
    expect(name()).toHaveValue("Old");
    fireEvent.change(name(), { target: { value: "  Review queue  " } });
    fireEvent.click(screen.getByTestId(WidgetSettingsDialogTestId.Save));
    expect(p.onSave).toHaveBeenCalledWith({ ...prs, title: "Review queue" });
    expect(p.onClose).toHaveBeenCalledOnce();
  });

  it("an empty name clears the title (back to the type label placeholder)", () => {
    const p = open();
    expect(name()).toHaveAttribute("placeholder", "Pull requesty");
    fireEvent.change(name(), { target: { value: "   " } });
    fireEvent.click(screen.getByTestId(WidgetSettingsDialogTestId.Save));
    expect(p.onSave).toHaveBeenCalledWith({ ...prs, title: undefined });
  });

  it("Cancel discards the draft", () => {
    const p = open();
    fireEvent.change(name(), { target: { value: "New" } });
    fireEvent.click(screen.getByTestId(WidgetSettingsDialogTestId.Cancel));
    expect(p.onSave).not.toHaveBeenCalled();
    expect(p.onClose).toHaveBeenCalledOnce();
  });

  it("Remove needs a confirming second click", () => {
    const p = open();
    fireEvent.click(screen.getByTestId(ConfirmDeleteButtonTestId.Root));
    expect(p.onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId(ConfirmDeleteButtonTestId.Root));
    expect(p.onRemove).toHaveBeenCalledOnce();
    expect(p.onSave).not.toHaveBeenCalled();
  });

  it("renders the type's own Settings and saves its draft change", () => {
    const kb: BridgeWidget = { id: "teamKb", type: "teamKb", x: 0, y: 0, w: 4, h: 6 };
    const p = open(kb);
    fireEvent.click(screen.getByText("pick"));
    expect(p.onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId(WidgetSettingsDialogTestId.Save));
    expect(p.onSave).toHaveBeenCalledWith({ ...kb, scope: { teamId: "sales" }, title: undefined });
  });
});
