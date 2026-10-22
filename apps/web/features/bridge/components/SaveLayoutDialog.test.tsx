import { FieldTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { SaveLayoutDialogTestId as Id, SaveLayoutDialog } from "./SaveLayoutDialog";

const setup = (saved: Record<string, unknown> = {}) => {
  const onSave = vi.fn();
  renderWithProviders(
    <SaveLayoutDialog
      open
      initialName="MY LAYOUT 01"
      onClose={vi.fn()}
      onSave={onSave}
      saved={saved}
    />,
  );
  return onSave;
};
const input = () => screen.getByTestId(Id.Input) as HTMLInputElement;

describe("SaveLayoutDialog", () => {
  it("prefills the next name and saves the typed one", async () => {
    const onSave = setup();
    expect(input().value).toBe("MY LAYOUT 01");
    await userEvent.clear(input());
    await userEvent.type(input(), " Mine ");
    await userEvent.click(screen.getByTestId(Id.Submit));
    expect(onSave).toHaveBeenCalledWith("Mine");
  });

  it("a taken name shows the error and does not save", async () => {
    const onSave = setup({ "MY LAYOUT 01": [] });
    await userEvent.click(screen.getByTestId(Id.Submit));
    expect(screen.getByTestId(FieldTestId.Error)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Enter submits", async () => {
    const onSave = setup();
    await userEvent.type(input(), "{Enter}");
    expect(onSave).toHaveBeenCalledWith("MY LAYOUT 01");
  });

  it("reopening starts fresh: prefilled name, no error", async () => {
    const props = { initialName: "MY LAYOUT 01", onClose: vi.fn(), onSave: vi.fn() };
    const saved = { "MY LAYOUT 01": [] };
    const { rerender } = renderWithProviders(<SaveLayoutDialog open saved={saved} {...props} />);
    await userEvent.click(screen.getByTestId(Id.Submit));
    expect(screen.getByTestId(FieldTestId.Error)).toBeInTheDocument();
    await userEvent.type(input(), "x");
    rerender(<SaveLayoutDialog open={false} saved={saved} {...props} />);
    rerender(<SaveLayoutDialog open saved={saved} {...props} />);
    expect(input().value).toBe("MY LAYOUT 01");
    expect(screen.queryByTestId(FieldTestId.Error)).toBeNull();
  });
});
