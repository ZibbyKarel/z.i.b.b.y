import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateDepartmentInputSchema } from "@zibby/contracts";
import { renderWithProviders as render, screen, waitFor } from "../../../test/render";
import { NewDepartmentDialog, NewDepartmentDialogTestId as TestId } from "./NewDepartmentDialog";

const divisions = [{ id: "business", name: "Business Operations", order: 2 }];

describe("NewDepartmentDialog", () => {
  it("submits a contract-valid department with tierDefault mapped to null", async () => {
    const onCreate = vi.fn();
    render(<NewDepartmentDialog divisions={divisions} onClose={vi.fn()} onCreate={onCreate} />);

    await userEvent.type(screen.getByTestId(TestId.Id), "pub");
    await userEvent.type(screen.getByTestId(TestId.Code), "PUB");
    await userEvent.type(screen.getByTestId(TestId.Name), "Publishing");
    await userEvent.type(screen.getByTestId(TestId.Tagline), "Knihy");
    await userEvent.type(screen.getByTestId(TestId.Mandate), "Coloring books");
    await userEvent.click(screen.getByTestId(TestId.Submit));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const body = onCreate.mock.calls[0]![0];
    expect(body).toMatchObject({
      id: "pub",
      code: "PUB",
      division: "business",
      icon: "grid",
      fallback: "primary",
      tierDefault: null,
    });
    expect(CreateDepartmentInputSchema.safeParse(body).success).toBe(true);
  });

  it("does not submit an id that breaks the slug regex", async () => {
    const onCreate = vi.fn();
    render(<NewDepartmentDialog divisions={divisions} onClose={vi.fn()} onCreate={onCreate} />);
    await userEvent.type(screen.getByTestId(TestId.Id), "Bad Id");
    await userEvent.click(screen.getByTestId(TestId.Submit));
    await waitFor(() =>
      expect(screen.getByTestId(TestId.Id)).toHaveAttribute("aria-invalid", "true"),
    );
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("cancels without creating", async () => {
    const onClose = vi.fn();
    const onCreate = vi.fn();
    render(<NewDepartmentDialog divisions={divisions} onClose={onClose} onCreate={onCreate} />);
    await userEvent.click(screen.getByTestId(TestId.Cancel));
    expect(onClose).toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
