import { FileDiffViewTestId } from "@zibby/design-system";
import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "../../../../test/render";
import messages from "../../../../i18n/messages/cs.json";
import { PrDiff } from "./PrDiff";

const BINARY = `diff --git a/img.png b/img.png
index 333..444 100644
Binary files a/img.png and b/img.png differ
`;

describe("PrDiff", () => {
  it("passes the cs labels to FileDiffView", () => {
    renderWithProviders(<PrDiff diff="" />);
    expect(screen.getByTestId(FileDiffViewTestId.Empty)).toHaveTextContent(
      messages.inboxPage.prs.diff.empty,
    );
    renderWithProviders(<PrDiff diff={BINARY} />);
    expect(screen.getByTestId(FileDiffViewTestId.NoHunks)).toHaveTextContent(
      messages.inboxPage.prs.diff.noHunks,
    );
  });
});
