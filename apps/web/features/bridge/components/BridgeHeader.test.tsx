import { DensityMenuTestId, MenuButtonTestId, SegmentedControlTestId } from "@zibby/design-system";
import { UiSettingsSchema } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { BridgeHeader, type BridgeHeaderProps, BridgeHeaderTestId } from "./BridgeHeader";

const setDensity = vi.fn();
vi.mock("../../system", () => ({
  useUiSettings: () => ({ ui: UiSettingsSchema.parse({}), setDensity, setBridge: vi.fn() }),
}));

const props: BridgeHeaderProps = {
  preset: "DEFAULT",
  layouts: { shown: [], hidden: [] },
  editing: false,
  onPreset: vi.fn(),
  onManage: vi.fn(),
  onToggleCatalog: vi.fn(),
  onSave: vi.fn(),
  onCancel: vi.fn(),
};
const item = (v: string) => `${SegmentedControlTestId.Item}-${v}`;
const two = { shown: ["A"], hidden: ["B"] };

describe("BridgeHeader", () => {
  it("density select calls setDensity", async () => {
    renderWithProviders(<BridgeHeader {...props} />);
    await userEvent.click(screen.getByTestId(DensityMenuTestId.Trigger));
    await userEvent.click(screen.getByTestId(`${DensityMenuTestId.Option}-compact`));
    expect(setDensity).toHaveBeenCalledWith("compact");
  });

  it("has no clock", () => {
    renderWithProviders(<BridgeHeader {...props} />);
    expect(screen.queryByText(/\d{2}:\d{2}/)).toBeNull();
  });

  it("shows the CUSTOM tab only when the preset is CUSTOM", () => {
    const { rerender } = renderWithProviders(<BridgeHeader {...props} layouts={two} />);
    expect(screen.getByTestId(item("A"))).toBeInTheDocument();
    expect(screen.queryByTestId(item("CUSTOM"))).toBeNull();
    rerender(<BridgeHeader {...props} preset="CUSTOM" />);
    expect(screen.getByTestId(item("CUSTOM"))).toBeInTheDocument();
  });

  it("preset click applies it; clicking CUSTOM does nothing", async () => {
    const onPreset = vi.fn();
    renderWithProviders(
      <BridgeHeader
        {...props}
        layouts={{ shown: ["REVIEW"], hidden: [] }}
        onPreset={onPreset}
        preset="CUSTOM"
      />,
    );
    await userEvent.click(screen.getByTestId(item("REVIEW")));
    expect(onPreset).toHaveBeenCalledWith("REVIEW");
    onPreset.mockClear();
    await userEvent.click(screen.getByTestId(item("CUSTOM")));
    expect(onPreset).not.toHaveBeenCalled();
  });

  it("view mode shows manage only; it calls onManage", async () => {
    const onManage = vi.fn();
    renderWithProviders(<BridgeHeader {...props} onManage={onManage} />);
    expect(screen.queryByTestId(BridgeHeaderTestId.Save)).toBeNull();
    expect(screen.queryByTestId(BridgeHeaderTestId.Cancel)).toBeNull();
    await userEvent.click(
      within(screen.getByTestId(BridgeHeaderTestId.Manage)).getByRole("button"),
    );
    expect(onManage).toHaveBeenCalled();
  });

  it("edit mode shows add widget, cancel and save, not manage", async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const onToggleCatalog = vi.fn();
    renderWithProviders(
      <BridgeHeader
        {...props}
        editing
        onCancel={onCancel}
        onSave={onSave}
        onToggleCatalog={onToggleCatalog}
      />,
    );
    expect(screen.queryByTestId(BridgeHeaderTestId.Manage)).toBeNull();
    await userEvent.click(within(screen.getByTestId(BridgeHeaderTestId.Save)).getByRole("button"));
    await userEvent.click(
      within(screen.getByTestId(BridgeHeaderTestId.Cancel)).getByRole("button"),
    );
    await userEvent.click(screen.getByText("+ WIDGET"));
    expect(onSave).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
    expect(onToggleCatalog).toHaveBeenCalled();
  });

  it("while editing, layouts cannot be switched and the kebab is hidden", async () => {
    const onPreset = vi.fn();
    renderWithProviders(<BridgeHeader {...props} editing layouts={two} onPreset={onPreset} />);
    expect(screen.queryByTestId(BridgeHeaderTestId.More)).toBeNull();
    await userEvent.click(screen.getByTestId(item("A")));
    expect(onPreset).not.toHaveBeenCalled();
  });

  it("hidden layouts sit in the kebab menu", async () => {
    const onPreset = vi.fn();
    renderWithProviders(<BridgeHeader {...props} layouts={two} onPreset={onPreset} />);
    expect(screen.queryByTestId(item("B"))).toBeNull();
    await userEvent.click(screen.getByTestId(MenuButtonTestId.Trigger));
    await userEvent.click(screen.getByTestId(`${MenuButtonTestId.Item}-B`));
    expect(onPreset).toHaveBeenCalledWith("B");
  });

  it("no menu without hidden layouts", () => {
    renderWithProviders(<BridgeHeader {...props} layouts={{ shown: ["A"], hidden: [] }} />);
    expect(screen.queryByTestId(BridgeHeaderTestId.More)).toBeNull();
  });

  it("the active hidden layout shows in the segmented control", () => {
    renderWithProviders(<BridgeHeader {...props} layouts={two} preset="B" />);
    expect(screen.getByTestId(item("B"))).toBeInTheDocument();
  });
});
