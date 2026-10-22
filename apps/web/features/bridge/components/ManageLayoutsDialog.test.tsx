import { ConfirmDeleteButtonTestId, DividerTestId, FieldTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "../../../test/render";
import {
  ManageLayoutsDialogTestId as Id,
  ManageLayoutsDialog,
  type ManageLayoutsDialogProps,
  moveLayout,
  stepLayout,
} from "./ManageLayoutsDialog";

const arr = { shown: ["A", "B"], hidden: ["C", "D"] };

describe("moveLayout / stepLayout", () => {
  it("inserts before a target index of the sequence without the moved name", () => {
    // flat without D: A B DIV C -> insert at 0 puts D first
    expect(moveLayout(arr, "D", 0)).toEqual({ shown: ["D", "A", "B"], hidden: ["C"] });
    // before the divider = end of shown
    expect(moveLayout(arr, "D", 2)).toEqual({ shown: ["A", "B", "D"], hidden: ["C"] });
    expect(moveLayout(arr, "A", 99)).toEqual({ shown: ["B"], hidden: ["C", "D", "A"] });
  });

  it("can empty either side", () => {
    expect(moveLayout({ shown: ["A"], hidden: [] }, "A", 1)).toEqual({ shown: [], hidden: ["A"] });
    expect(moveLayout({ shown: [], hidden: ["A"] }, "A", 0)).toEqual({ shown: ["A"], hidden: [] });
  });

  it("steps swap sides across the divider", () => {
    expect(stepLayout(arr, "B", 1)).toEqual({ shown: ["A"], hidden: ["B", "C", "D"] });
    expect(stepLayout(arr, "C", -1)).toEqual({ shown: ["A", "B", "C"], hidden: ["D"] });
    expect(stepLayout(arr, "A", 1)).toEqual({ shown: ["B", "A"], hidden: ["C", "D"] });
  });
});

const setup = (over: Partial<ManageLayoutsDialogProps> = {}) => {
  const props: ManageLayoutsDialogProps = {
    open: true,
    preset: "A",
    layouts: arr,
    nextName: "MY LAYOUT 01",
    saved: { A: [], B: [], C: [], D: [] },
    onArrange: vi.fn(),
    onAdd: vi.fn(() => true),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  renderWithProviders(<ManageLayoutsDialog {...props} />);
  return props;
};
const row = (n: string) => screen.getByTestId(`${Id.Row}-${n}`);

describe("ManageLayoutsDialog", () => {
  it("renders shown rows, the divider, then hidden rows; DEFAULT has no actions", () => {
    setup();
    const order = [...screen.getAllByTestId(new RegExp(`^${Id.Row}-|^${Id.Divider}$`))].map((el) =>
      el.getAttribute("data-testid"),
    );
    expect(order).toEqual([`${Id.Row}-A`, `${Id.Row}-B`, Id.Divider, `${Id.Row}-C`, `${Id.Row}-D`]);
    expect(within(screen.getByTestId(Id.Divider)).getByTestId(DividerTestId.Root)).toBeVisible();
    expect(screen.getAllByTestId(new RegExp(`^${Id.Edit}-`))).toHaveLength(4);
    expect(screen.getAllByTestId(ConfirmDeleteButtonTestId.Root)).toHaveLength(4);
  });

  it("edit calls onEdit; delete needs two clicks", async () => {
    const p = setup();
    await userEvent.click(screen.getByTestId(`${Id.Edit}-C`));
    expect(p.onEdit).toHaveBeenCalledWith("C");
    const del = within(screen.getByTestId(`${Id.Delete}-B`)).getByTestId(
      ConfirmDeleteButtonTestId.Root,
    );
    await userEvent.click(del);
    expect(p.onDelete).not.toHaveBeenCalled();
    await userEvent.click(del);
    expect(p.onDelete).toHaveBeenCalledWith("B");
  });

  it("ends are disabled; move-down of the last shown row moves it to hidden", async () => {
    const p = setup();
    expect(screen.getByTestId(`${Id.Up}-A`)).toBeDisabled();
    expect(screen.getByTestId(`${Id.Down}-D`)).toBeDisabled();
    await userEvent.click(screen.getByTestId(`${Id.Down}-B`));
    expect(p.onArrange).toHaveBeenCalledWith({ shown: ["A"], hidden: ["B", "C", "D"] });
  });

  it("dragging a row onto another inserts it before; onto the divider ends shown", () => {
    const p = setup();
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? "",
      get types() {
        return [...data.keys()];
      },
    };
    fireEvent.dragStart(row("D"), { dataTransfer });
    fireEvent.dragOver(row("A"), { dataTransfer });
    fireEvent.drop(row("A"), { dataTransfer });
    expect(p.onArrange).toHaveBeenLastCalledWith({ shown: ["D", "A", "B"], hidden: ["C"] });
    fireEvent.drop(screen.getByTestId(Id.Divider), { dataTransfer });
    expect(p.onArrange).toHaveBeenLastCalledWith({ shown: ["A", "B", "D"], hidden: ["C"] });
  });

  it("an empty hidden section is a drop zone", () => {
    const p = setup({ layouts: { shown: ["A"], hidden: [] }, saved: { A: [] } });
    const data = new Map<string, string>([["application/x-zibby-bridge-layout", "A"]]);
    const dataTransfer = {
      setData: vi.fn(),
      getData: (k: string) => data.get(k) ?? "",
      types: [...data.keys()],
    };
    fireEvent.drop(screen.getByTestId(Id.DropHidden), { dataTransfer });
    expect(p.onArrange).toHaveBeenCalledWith({ shown: [], hidden: ["A"] });
  });

  it("adds a valid name (prefilled, Enter submits) and errors on a taken one", async () => {
    const p = setup();
    const input = screen.getByTestId(Id.Input) as HTMLInputElement;
    expect(input.value).toBe("MY LAYOUT 01");
    await userEvent.type(input, "{Enter}");
    expect(p.onAdd).toHaveBeenCalledWith("MY LAYOUT 01");
    await userEvent.clear(input);
    await userEvent.type(input, "a");
    await userEvent.click(screen.getByTestId(Id.Add));
    expect(screen.getByTestId(FieldTestId.Error)).toBeInTheDocument();
    expect(p.onAdd).toHaveBeenCalledTimes(1);
  });
});
