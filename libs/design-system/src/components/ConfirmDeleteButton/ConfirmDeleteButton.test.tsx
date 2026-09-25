import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONFIRM_DELETE_TIMEOUT_MS,
  ConfirmDeleteButton,
  ConfirmDeleteButtonTestId,
} from "./ConfirmDeleteButton";

describe("ConfirmDeleteButton", () => {
  it("renders the idle label and does not confirm on the first click", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDeleteButton onConfirm={onConfirm} />);
    expect(screen.getByTestId(ConfirmDeleteButtonTestId.Root)).toHaveTextContent("Delete");
    await userEvent.click(screen.getByTestId(ConfirmDeleteButtonTestId.Root));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId(ConfirmDeleteButtonTestId.Root)).toHaveTextContent("Confirm delete");
  });

  it("confirms on the second click while armed", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDeleteButton onConfirm={onConfirm} />);
    const button = screen.getByTestId(ConfirmDeleteButtonTestId.Root);
    await userEvent.click(button);
    await userEvent.click(button);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(button).toHaveTextContent("Delete");
  });

  it("shows a dot while armed", async () => {
    render(<ConfirmDeleteButton onConfirm={() => {}} />);
    expect(screen.queryByTestId(ConfirmDeleteButtonTestId.Dot)).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId(ConfirmDeleteButtonTestId.Root));
    expect(screen.getByTestId(ConfirmDeleteButtonTestId.Dot)).toBeInTheDocument();
  });

  it("supports custom idle/confirm labels", async () => {
    render(
      <ConfirmDeleteButton
        confirmLabel="Really remove?"
        label="Remove company"
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByTestId(ConfirmDeleteButtonTestId.Root)).toHaveTextContent("Remove company");
    await userEvent.click(screen.getByTestId(ConfirmDeleteButtonTestId.Root));
    expect(screen.getByTestId(ConfirmDeleteButtonTestId.Root)).toHaveTextContent("Really remove?");
  });

  describe("timeout reset", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("reverts to idle after the confirm window expires", () => {
      const onConfirm = vi.fn();
      render(<ConfirmDeleteButton onConfirm={onConfirm} />);
      const button = screen.getByTestId(ConfirmDeleteButtonTestId.Root);
      fireEvent.click(button);
      expect(button).toHaveTextContent("Confirm delete");
      act(() => {
        vi.advanceTimersByTime(CONFIRM_DELETE_TIMEOUT_MS + 1);
      });
      expect(button).toHaveTextContent("Delete");
      fireEvent.click(button);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  it("disarms on blur", async () => {
    render(<ConfirmDeleteButton onConfirm={() => {}} />);
    const button = screen.getByTestId(ConfirmDeleteButtonTestId.Root);
    await userEvent.click(button);
    expect(button).toHaveTextContent("Confirm delete");
    fireEvent.blur(button);
    expect(button).toHaveTextContent("Delete");
  });
});
