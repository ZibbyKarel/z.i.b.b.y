import { DensityMenuTestId, SegmentedControlTestId } from "@zibby/design-system";
import { UiSettingsSchema } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { BridgeHeader, type BridgeHeaderProps, formatBridgeClock } from "./BridgeHeader";

const setDensity = vi.fn();
vi.mock("../../system", () => ({
  useUiSettings: () => ({ ui: UiSettingsSchema.parse({}), setDensity, setBridge: vi.fn() }),
}));

const props: BridgeHeaderProps = {
  preset: "DEFAULT",
  saved: [],
  editing: false,
  onPreset: vi.fn(),
  onToggleEditing: vi.fn(),
  onToggleCatalog: vi.fn(),
  onSaveAs: vi.fn(),
  onReset: vi.fn(),
};
const item = (v: string) => `${SegmentedControlTestId.Item}-${v}`;

describe("BridgeHeader", () => {
  it("density select calls setDensity", async () => {
    renderWithProviders(<BridgeHeader {...props} />);
    await userEvent.click(screen.getByTestId(DensityMenuTestId.Trigger));
    await userEvent.click(screen.getByTestId(`${DensityMenuTestId.Option}-compact`));
    expect(setDensity).toHaveBeenCalledWith("compact");
  });

  it("shows the CUSTOM tab only when the preset is CUSTOM, plus saved names", () => {
    const { rerender } = renderWithProviders(<BridgeHeader {...props} saved={["MY LAYOUT 01"]} />);
    expect(screen.getByTestId(item("MY LAYOUT 01"))).toBeInTheDocument();
    expect(screen.queryByTestId(item("CUSTOM"))).toBeNull();
    rerender(<BridgeHeader {...props} preset="CUSTOM" />);
    expect(screen.getByTestId(item("CUSTOM"))).toBeInTheDocument();
  });

  it("preset click applies it; clicking CUSTOM does nothing", async () => {
    const onPreset = vi.fn();
    renderWithProviders(<BridgeHeader {...props} onPreset={onPreset} preset="CUSTOM" />);
    await userEvent.click(screen.getByTestId(item("REVIEW")));
    expect(onPreset).toHaveBeenCalledWith("REVIEW");
    onPreset.mockClear();
    await userEvent.click(screen.getByTestId(item("CUSTOM")));
    expect(onPreset).not.toHaveBeenCalled();
  });

  it("edit-only buttons appear in edit mode only", () => {
    const { rerender } = renderWithProviders(<BridgeHeader {...props} />);
    expect(screen.queryByText(/SAVE AS|ULOŽIT JAKO/)).toBeNull();
    rerender(<BridgeHeader {...props} editing />);
    expect(screen.getByText(/ULOŽIT JAKO/)).toBeInTheDocument();
  });
});

describe("formatBridgeClock", () => {
  it("formats `THU 24 SEP · 14:32` uppercase", () => {
    expect(formatBridgeClock(new Date(2026, 8, 24, 14, 32), "en")).toBe("THU 24 SEP · 14:32");
  });
});
