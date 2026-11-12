import {
  DensityMenuTestId,
  IconTestId,
  MenuButtonTestId,
  SegmentedControlTestId,
} from "@zibby/design-system";
import { UiSettingsSchema } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { WIDGETS, WIDGET_TYPES } from "../widgets/registry";
import { BridgeHeader, type BridgeHeaderProps, BridgeHeaderTestId } from "./BridgeHeader";

const setDensity = vi.fn();
vi.mock("../../system", () => ({
  useUiSettings: () => ({ ui: UiSettingsSchema.parse({}), setDensity, setBridge: vi.fn() }),
}));

const props: BridgeHeaderProps = {
  preset: "DEFAULT",
  layouts: { shown: [], hidden: [] },
  onPreset: vi.fn(),
  onManage: vi.fn(),
  onAddWidget: vi.fn(),
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

  it("add widget is an icon dropdown: every type with icon/name/description; a click adds it and closes", async () => {
    const onAddWidget = vi.fn();
    renderWithProviders(<BridgeHeader {...props} onAddWidget={onAddWidget} />);
    const trigger = screen.getByTestId(MenuButtonTestId.Trigger);
    expect(trigger).toHaveAccessibleName("Přidat widget");
    await userEvent.click(trigger);
    for (const type of WIDGET_TYPES) {
      const row = screen.getByTestId(`${MenuButtonTestId.Item}-${type}`);
      expect(within(row).getByTestId(IconTestId.Root)).toHaveAttribute(
        "data-icon",
        WIDGETS[type].icon,
      );
      expect(
        screen.getByTestId(`${MenuButtonTestId.Description}-${type}`),
      ).not.toBeEmptyDOMElement();
    }
    expect(screen.queryByRole("button", { name: /^(přidat|add)$/i })).toBeNull();
    await userEvent.click(screen.getByTestId(`${MenuButtonTestId.Item}-prs`));
    expect(onAddWidget).toHaveBeenCalledWith("prs");
    expect(screen.queryByTestId(MenuButtonTestId.Menu)).toBeNull();
  });

  it("always shows manage, never save/cancel; manage calls onManage", async () => {
    const onManage = vi.fn();
    renderWithProviders(<BridgeHeader {...props} onManage={onManage} />);
    await userEvent.click(
      within(screen.getByTestId(BridgeHeaderTestId.Manage)).getByRole("button"),
    );
    expect(onManage).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /save|cancel|uložit|zrušit/i })).toBeNull();
  });

  it("manage is an icon-only button named by its label, with no title or caption", () => {
    renderWithProviders(<BridgeHeader {...props} />);
    const manage = within(screen.getByTestId(BridgeHeaderTestId.Manage)).getByRole("button");
    expect(manage).toHaveAccessibleName("Upravit rozložení");
    expect(manage).not.toHaveTextContent("Upravit rozložení");
    expect(screen.queryByText("Rozložení")).toBeNull();
    expect(screen.queryByText("Můstek")).toBeNull();
  });

  it("hidden layouts are not offered in the header", () => {
    renderWithProviders(<BridgeHeader {...props} layouts={two} />);
    expect(screen.queryByTestId(item("B"))).toBeNull();
  });

  it("the active hidden layout shows in the segmented control", () => {
    renderWithProviders(<BridgeHeader {...props} layouts={two} preset="B" />);
    expect(screen.getByTestId(item("B"))).toBeInTheDocument();
  });
});
