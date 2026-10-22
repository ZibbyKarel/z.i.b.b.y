import type { InboxPr } from "@zibby/contracts";
import { DialogTestId, DropDownButtonTestId } from "@zibby/design-system";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "../../../test/render";
import { PrReviewButton, PrReviewButtonTestId } from "./PrReviewButton";

const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("../mutations", () => ({
  useSubmitInboxPrReviewMutation: () => ({ mutate: submit, isPending: false }),
}));

function pr(over: Partial<InboxPr>): InboxPr {
  return {
    source: "github",
    number: 5,
    title: "PR 5",
    url: "https://github.com/acme/api/pull/5",
    repo: "acme/api",
    author: "someone",
    createdAt: "2026-01-01T00:00:00.000Z",
    draft: false,
    ci: "passing",
    review: "none",
    mergeable: true,
    bucket: "to-review",
    blocker: "awaiting-review",
    section: "needs-your-review",
    projectId: "api",
    ...over,
  };
}

const root = () => screen.getByTestId(PrReviewButtonTestId.Root);
const openDialog = () => fireEvent.click(within(root()).getByTestId(DropDownButtonTestId.Primary));
const selectEvent = (event: string) => {
  fireEvent.click(within(root()).getByTestId(DropDownButtonTestId.Trigger));
  fireEvent.click(screen.getByTestId(`${DropDownButtonTestId.Item}-${event}`));
};
const type = (value: string) =>
  fireEvent.change(screen.getByTestId(PrReviewButtonTestId.Comment), { target: { value } });

afterEach(() => submit.mockReset());

describe("PrReviewButton", () => {
  it("renders nothing on my own PR", () => {
    renderWithProviders(<PrReviewButton pr={pr({ bucket: "mine" })} />);
    expect(screen.queryByTestId(PrReviewButtonTestId.Root)).toBeNull();
  });

  it("approves without a comment", () => {
    renderWithProviders(<PrReviewButton pr={pr({})} />);
    openDialog();
    expect(screen.getByTestId(PrReviewButtonTestId.Dialog)).toBeTruthy();
    fireEvent.click(screen.getByTestId(PrReviewButtonTestId.Submit));
    expect(submit).toHaveBeenCalledWith(
      { params: { projectId: "api", number: 5 }, body: { event: "APPROVE", body: undefined } },
      expect.anything(),
    );
  });

  it("disables submit for comment without text", () => {
    renderWithProviders(<PrReviewButton pr={pr({})} />);
    selectEvent("COMMENT");
    openDialog();
    const btn = screen.getByTestId(PrReviewButtonTestId.Submit);
    expect(btn.hasAttribute("disabled")).toBe(true);
    type("   ");
    expect(btn.hasAttribute("disabled")).toBe(true);
    type("nit");
    expect(btn.hasAttribute("disabled")).toBe(false);
    fireEvent.click(btn);
    expect(submit).toHaveBeenCalledWith(
      { params: { projectId: "api", number: 5 }, body: { event: "COMMENT", body: "nit" } },
      expect.anything(),
    );
  });

  it("keeps the dialog open and shows the error", () => {
    submit.mockImplementation((_v, opts) =>
      opts.onError({ status: 422, body: { message: "Can not approve your own pull request" } }),
    );
    renderWithProviders(<PrReviewButton pr={pr({})} />);
    openDialog();
    fireEvent.click(screen.getByTestId(PrReviewButtonTestId.Submit));
    expect(screen.getByTestId(PrReviewButtonTestId.Dialog)).toBeTruthy();
    expect(screen.getByTestId(PrReviewButtonTestId.Error).textContent).toBe(
      "Can not approve your own pull request",
    );
  });

  it("shows the generic text on a non-422 error and clears it on retry", () => {
    submit.mockImplementationOnce((_v, opts) =>
      opts.onError({ status: 502, body: { message: "x" } }),
    );
    renderWithProviders(<PrReviewButton pr={pr({})} />);
    openDialog();
    fireEvent.click(screen.getByTestId(PrReviewButtonTestId.Submit));
    expect(screen.getByTestId(PrReviewButtonTestId.Error).textContent).toBe(
      "Review se nepodařilo odeslat.",
    );
    fireEvent.click(screen.getByTestId(PrReviewButtonTestId.Submit));
    expect(screen.queryByTestId(PrReviewButtonTestId.Error)).toBeNull();
  });

  it("resets to approve after submit", () => {
    submit.mockImplementation((_v, opts) => opts.onSuccess());
    renderWithProviders(<PrReviewButton pr={pr({})} />);
    selectEvent("REQUEST_CHANGES");
    openDialog();
    type("x");
    fireEvent.click(screen.getByTestId(PrReviewButtonTestId.Submit));
    expect(screen.queryByTestId(PrReviewButtonTestId.Dialog)).toBeNull();
    expect(within(root()).getByTestId(DropDownButtonTestId.Primary).textContent).toContain(
      "Schválit",
    );
    openDialog();
    expect((screen.getByTestId(PrReviewButtonTestId.Comment) as HTMLTextAreaElement).value).toBe(
      "",
    );
    expect(screen.getByTestId(DialogTestId.Title).textContent).toContain("Schválit");
  });
});
