import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportDialog, ImportDialogTestId } from "./ImportDialog";

type MutateVars = { body: { sourcePath: string; distillNow: boolean } };
type MutateResult = { body: { staged: number; skipped: number } };
type MutateOpts = { onSuccess?: (result: MutateResult) => void };

const importResult: MutateResult = { body: { staged: 3, skipped: 1 } };

const importMock = vi.fn((_vars: MutateVars, opts?: MutateOpts) => opts?.onSuccess?.(importResult));
const emit = vi.fn();

vi.mock("../mutations", () => ({
  useImportMutation: () => ({ mutate: importMock, isPending: false }),
}));

vi.mock("../../../components/Toaster/toastBus", () => ({
  toastBus: { emit: (...args: unknown[]) => emit(...args) },
}));

/**
 * Phase 112c — bulk-import dialog: a folder path, a "distill now" toggle
 * (default off), and a submit that POSTs `{ sourcePath, distillNow }`. On
 * success it closes and toasts, with copy that switches on the toggle.
 */
describe("ImportDialog", () => {
  beforeEach(() => {
    importMock.mockClear();
    emit.mockClear();
  });

  it("submits { sourcePath, distillNow: false } by default and toasts the 'later' copy", async () => {
    const onClose = vi.fn();
    render(<ImportDialog onClose={onClose} />);

    await userEvent.type(screen.getByTestId(ImportDialogTestId.SourcePath), "/tmp/import-me");
    await userEvent.click(screen.getByTestId(ImportDialogTestId.Submit));

    expect(importMock).toHaveBeenCalledTimes(1);
    expect(importMock.mock.calls[0]?.[0].body).toEqual({
      sourcePath: "/tmp/import-me",
      distillNow: false,
    });
    expect(emit).toHaveBeenCalledWith({
      message: "Zařazeno 3 souborů (1 přeskočeno). Roztřídí se při noční destilaci.",
      severity: "ok",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("toggling 'distill now' submits distillNow: true and toasts the 'now' copy", async () => {
    const onClose = vi.fn();
    render(<ImportDialog onClose={onClose} />);

    await userEvent.type(screen.getByTestId(ImportDialogTestId.SourcePath), "/tmp/import-me");
    await userEvent.click(screen.getByTestId(ImportDialogTestId.DistillNow));
    await userEvent.click(screen.getByTestId(ImportDialogTestId.Submit));

    expect(importMock.mock.calls[0]?.[0].body).toEqual({
      sourcePath: "/tmp/import-me",
      distillNow: true,
    });
    expect(emit).toHaveBeenCalledWith({
      message: "Zařazeno 3 souborů (1 přeskočeno). Roztřídí se hned na pozadí.",
      severity: "ok",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("disables submit until a source path is entered", () => {
    render(<ImportDialog onClose={vi.fn()} />);
    expect(screen.getByTestId(ImportDialogTestId.Submit)).toBeDisabled();
  });
});
