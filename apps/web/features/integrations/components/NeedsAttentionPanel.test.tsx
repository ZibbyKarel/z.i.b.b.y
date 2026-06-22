import { renderWithProviders as render, screen } from "../../../test/render";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChannelItem } from "@zibby/contracts";
import { NeedsAttentionPanel, NeedsAttentionTestId } from "./NeedsAttentionPanel";

let items: ChannelItem[] = [];
const mutate = vi.fn();
vi.mock("../queries", () => ({
  useChannelItemsQuery: () => ({ data: items }),
}));
vi.mock("../mutations", () => ({
  useDismissChannelItemMutation: () => ({ mutate, isPending: false }),
}));

const item = (over: Partial<ChannelItem>): ChannelItem => ({
  id: "m-1",
  integrationId: "mail",
  kind: "email",
  externalRef: { messageId: "<abc@gmail.com>", channel: "INBOX" },
  from: "jan@corp.com",
  receivedAt: "2026-06-12T00:00:00.000Z",
  text: "Can we move Tuesday's call?",
  raw: {},
  state: "triaged",
  triage: {
    actionable: true,
    tier: 2,
    category: "question",
    summary: "Jan asks to move Tuesday's call",
    confidence: 0.8,
    reason: "q",
  },
  ...over,
});

describe("NeedsAttentionPanel", () => {
  it("renders nothing when no items need attention", () => {
    items = [];
    render(<NeedsAttentionPanel />);
    expect(screen.queryByTestId(NeedsAttentionTestId.Root)).toBeNull();
  });

  it("surfaces only triaged items WITHOUT a pending approval, showing the summary", () => {
    items = [
      item({ id: "surfaced" }),
      // Parked approval — belongs in the approvals queue, not here.
      item({ id: "parked", approvalId: "appr_1" }),
      // Already handled / ignored — gone from the list.
      item({ id: "done", state: "handled" }),
    ];
    render(<NeedsAttentionPanel />);
    expect(screen.getByTestId(NeedsAttentionTestId.Root)).toBeInTheDocument();
    expect(screen.getAllByTestId(NeedsAttentionTestId.Card)).toHaveLength(1);
    expect(screen.getByText("Jan asks to move Tuesday's call")).toBeInTheDocument();
  });

  it("links an email to the original via a Gmail rfc822msgid deep link", () => {
    items = [item({ id: "surfaced" })];
    render(<NeedsAttentionPanel />);
    const link = screen.getByTestId(NeedsAttentionTestId.OpenEmail);
    expect(link).toHaveAttribute(
      "href",
      "https://mail.google.com/mail/u/0/#search/rfc822msgid:abc%40gmail.com",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("dismisses an item by id when the dismiss button is clicked", () => {
    items = [item({ id: "surfaced" })];
    render(<NeedsAttentionPanel />);
    fireEvent.click(screen.getByTestId(NeedsAttentionTestId.Dismiss));
    expect(mutate).toHaveBeenCalledWith({ params: { id: "surfaced" }, body: {} });
  });

  it("falls back to the sender + preview when the triager produced no summary", () => {
    items = [
      item({
        id: "nosum",
        triage: { actionable: true, tier: 2, category: "question", confidence: 0.8, reason: "q" },
      }),
    ];
    render(<NeedsAttentionPanel />);
    expect(screen.getByText(/jan@corp\.com: Can we move Tuesday's call\?/)).toBeInTheDocument();
  });
});
