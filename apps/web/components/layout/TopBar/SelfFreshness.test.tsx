import type { SelfStatus } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Toast, toastBus } from "../../../components/Toaster/toastBus";
import { fireEvent, renderWithProviders, screen } from "../../../test/render";
import { SelfFreshness, SelfFreshnessTestId } from "./SelfFreshness";

const { statusRef, mutateMock } = vi.hoisted(() => ({
  statusRef: { value: undefined as SelfStatus | undefined },
  mutateMock: vi.fn(),
}));

vi.mock("../../../features/self", () => ({
  useSelfStatusQuery: () => ({ data: statusRef.value }),
  useSelfUpdateMutation: () => ({ mutate: mutateMock, isPending: false }),
}));

const UP_TO_DATE: SelfStatus = {
  currentBranch: "main",
  defaultBranch: "main",
  behind: 0,
  ahead: 0,
  dirty: false,
  upToDate: true,
  openPrCount: 0,
  prs: [],
  ghAvailable: true,
};

const BEHIND_WITH_PRS: SelfStatus = {
  ...UP_TO_DATE,
  behind: 3,
  upToDate: false,
  openPrCount: 2,
  prs: [
    { number: 12, title: "Fix the thing", url: "https://github.com/o/r/pull/12" },
    { number: 13, title: "Add feature", url: "https://github.com/o/r/pull/13" },
  ],
};

/** Drive HoldButton to a confirmed activation without waiting out the hold timer:
 * a first press arms it, a second (while armed) confirms — the timing-free path. */
function confirmHold(el: HTMLElement) {
  fireEvent.pointerDown(el);
  fireEvent.pointerUp(el);
  fireEvent.pointerDown(el);
  fireEvent.pointerUp(el);
}

/** Collect every toast emitted during `run`. */
function captureToasts(run: () => void): Toast[] {
  const received: Toast[] = [];
  const unsubscribe = toastBus.subscribe((toast) => received.push(toast));
  try {
    run();
  } finally {
    unsubscribe();
  }
  return received;
}

describe("SelfFreshness", () => {
  beforeEach(() => {
    mutateMock.mockReset();
    statusRef.value = undefined;
  });

  it("renders a calm state with the 'current' label but no behind text or update button when up to date", () => {
    statusRef.value = UP_TO_DATE;
    renderWithProviders(<SelfFreshness />);
    expect(screen.getByTestId(SelfFreshnessTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(SelfFreshnessTestId.Label)).toHaveTextContent("Aktuální");
    expect(screen.queryByTestId(SelfFreshnessTestId.UpdateButton)).not.toBeInTheDocument();
  });

  it("falls back to the calm up-to-date state before the first poll resolves (data undefined)", () => {
    statusRef.value = undefined;
    renderWithProviders(<SelfFreshness />);
    expect(screen.queryByTestId(SelfFreshnessTestId.UpdateButton)).not.toBeInTheDocument();
  });

  it("swaps the calm label for an 'Upgrade' hold-button that triggers the mutation when behind", () => {
    statusRef.value = BEHIND_WITH_PRS;
    renderWithProviders(<SelfFreshness />);
    // When behind, the calm Label is gone and the actionable HoldButton carries "Upgrade".
    expect(screen.queryByTestId(SelfFreshnessTestId.Label)).not.toBeInTheDocument();
    const button = screen.getByTestId(SelfFreshnessTestId.UpdateButton);
    expect(button).toHaveTextContent("Upgrade");
    confirmHold(button);
    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock.mock.calls[0]?.[0]).toEqual({ body: {} });
  });

  it("emits a success toast carrying the server's message and leaves nothing in the control body", () => {
    statusRef.value = BEHIND_WITH_PRS;
    mutateMock.mockImplementation((_vars, opts) => {
      opts.onSuccess({ status: 200, body: { updated: true, behind: 0, message: "ZIBBY aktualizován" } });
    });
    renderWithProviders(<SelfFreshness />);

    const toasts = captureToasts(() =>
      confirmHold(screen.getByTestId(SelfFreshnessTestId.UpdateButton)),
    );

    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ severity: "ok", message: "ZIBBY aktualizován" });
  });

  it("falls back to a localized success message when the server sends none", () => {
    statusRef.value = BEHIND_WITH_PRS;
    mutateMock.mockImplementation((_vars, opts) => {
      opts.onSuccess({ status: 200, body: { updated: true, behind: 0 } });
    });
    renderWithProviders(<SelfFreshness />);

    const toasts = captureToasts(() =>
      confirmHold(screen.getByTestId(SelfFreshnessTestId.UpdateButton)),
    );

    expect(toasts[0]).toMatchObject({ severity: "ok", message: "ZIBBY byl aktualizován" });
  });

  it("emits an error toast with the 409 refusal message and resets the button rather than leaving it green", () => {
    statusRef.value = BEHIND_WITH_PRS;
    const refusal = "Refusing to update — the ZIBBY install has uncommitted changes.";
    mutateMock.mockImplementation((_vars, opts) => {
      opts.onError({ status: 409, body: { message: refusal } });
    });
    renderWithProviders(<SelfFreshness />);

    const toasts = captureToasts(() =>
      confirmHold(screen.getByTestId(SelfFreshnessTestId.UpdateButton)),
    );

    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ severity: "error", message: refusal });
    // The refusal reset the HoldButton to its idle "Upgrade" state — not the green
    // "Confirmed" done state that would contradict the failure.
    expect(screen.getByTestId(SelfFreshnessTestId.UpdateButton)).toHaveTextContent("Upgrade");
  });

  it("falls back to a localized error message when the thrown error carries no body message", () => {
    statusRef.value = BEHIND_WITH_PRS;
    mutateMock.mockImplementation((_vars, opts) => {
      opts.onError(new Error("network"));
    });
    renderWithProviders(<SelfFreshness />);

    const toasts = captureToasts(() =>
      confirmHold(screen.getByTestId(SelfFreshnessTestId.UpdateButton)),
    );

    expect(toasts[0]).toMatchObject({ severity: "error", message: "Aktualizace se nezdařila" });
  });

  it("lists every open PR as an external link on hover, with the right href/target/rel", () => {
    statusRef.value = BEHIND_WITH_PRS;
    renderWithProviders(<SelfFreshness />);
    fireEvent.mouseEnter(screen.getByTestId(SelfFreshnessTestId.Root));

    const rows = screen.getAllByTestId(SelfFreshnessTestId.PrRow);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("href", "https://github.com/o/r/pull/12");
    expect(rows[0]).toHaveAttribute("target", "_blank");
    expect(rows[0]).toHaveAttribute("rel", "noreferrer");
    expect(rows[0]).toHaveTextContent("#12 Fix the thing");
  });

  it("shows the 'no open PRs' note on hover when the list is empty (gh unavailable or none open)", () => {
    statusRef.value = { ...UP_TO_DATE, ghAvailable: false, prs: [], openPrCount: 0 };
    renderWithProviders(<SelfFreshness />);
    fireEvent.mouseEnter(screen.getByTestId(SelfFreshnessTestId.Root));

    expect(screen.getByTestId(SelfFreshnessTestId.PrEmpty)).toHaveTextContent("žádné otevřené PR");
    expect(screen.queryByTestId(SelfFreshnessTestId.PrRow)).not.toBeInTheDocument();
  });
});
