import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { WidgetCatalogTestId } from "@zibby/design-system";
import { type BridgeSelection, WIDGET_TYPES } from "../widgets/registry";
import { BridgeScreen } from "./BridgeScreen";

const h = vi.hoisted(() => ({
  phone: true,
  push: vi.fn(),
  setSelection: vi.fn(),
  catalogOpen: false,
  add: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../../hooks/useIsPhone", () => ({ useIsPhone: () => h.phone }));
vi.mock("../../system", () => ({ useUiSettings: () => ({ ui: { density: "comfort" } }) }));
vi.mock("../state/useBridgeState", () => ({
  useBridgeState: () => ({
    layout: [{ id: "prs", type: "prs", x: 0, y: 0, w: 4, h: 6 }],
    layouts: { shown: [], hidden: [] },
    selection: null,
    setSelection: h.setSelection,
    catalogOpen: h.catalogOpen,
    add: h.add,
  }),
}));
vi.mock("./BridgeHeader", () => ({ BridgeHeader: () => null }));
vi.mock("./ManageLayoutsDialog", () => ({ ManageLayoutsDialog: () => null }));
vi.mock("./DetailSheet", () => ({ DetailSheet: () => null }));
vi.mock("./BridgeBoard", () => ({
  BridgeBoard: ({ onOpen }: { onOpen?: (s: BridgeSelection) => void }) => (
    <>
      <button
        onClick={() =>
          onOpen?.({ kind: "task", id: "t1", widgetId: "w", key: "w:t1", href: "/work/tasks/t1" })
        }
      >
        with-href
      </button>
      <button onClick={() => onOpen?.({ kind: "pr", id: "p1", widgetId: "w", key: "w:p1" })}>
        no-href
      </button>
      <span data-testid="has-onopen">{String(onOpen !== undefined)}</span>
    </>
  ),
}));

describe("BridgeScreen catalog", () => {
  it("lists every widget type with its icon, including types already on the board", () => {
    h.catalogOpen = true;
    renderWithProviders(<BridgeScreen />);
    h.catalogOpen = false;
    for (const type of WIDGET_TYPES) {
      expect(screen.getByTestId(`${WidgetCatalogTestId.Entry}-${type}`)).toBeInTheDocument();
      expect(screen.getByTestId(`${WidgetCatalogTestId.Icon}-${type}`)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByTestId(`${WidgetCatalogTestId.Add}-prs`));
    expect(h.add).toHaveBeenCalledWith("prs");
  });
});

describe("BridgeScreen on a phone", () => {
  beforeEach(() => {
    h.phone = true;
    h.push.mockClear();
    h.setSelection.mockClear();
  });

  it("navigates to the item's detail page instead of opening the sheet", () => {
    renderWithProviders(<BridgeScreen />);
    fireEvent.click(screen.getByText("with-href"));
    expect(h.push).toHaveBeenCalledWith("/work/tasks/t1");
    expect(h.setSelection).not.toHaveBeenCalled();
  });

  it("still opens the sheet for a selection without a detail page", () => {
    renderWithProviders(<BridgeScreen />);
    fireEvent.click(screen.getByText("no-href"));
    expect(h.setSelection).toHaveBeenCalledWith(expect.objectContaining({ kind: "pr" }));
    expect(h.push).not.toHaveBeenCalled();
  });

  it("leaves the board's default onOpen (the sheet) on desktop", () => {
    h.phone = false;
    renderWithProviders(<BridgeScreen />);
    expect(screen.getByTestId("has-onopen")).toHaveTextContent("false");
  });
});
