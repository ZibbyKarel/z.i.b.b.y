import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { NeedsYouCard, NeedsYouCardTestId } from "./NeedsYouCard";

describe("NeedsYouCard", () => {
  it("renders heading, wait, text, rule and diff", () => {
    render(
      <NeedsYouCard
        diff={["@@ -1 +1 @@", "-a", "+b"]}
        heading="NEEDS YOU · PUSH"
        rule="RULE · x"
        text="Push it?"
        wait="WAITING 2H"
      />,
    );
    expect(screen.getByTestId(NeedsYouCardTestId.Heading)).toHaveTextContent("NEEDS YOU · PUSH");
    expect(screen.getByTestId(NeedsYouCardTestId.Wait)).toHaveTextContent("WAITING 2H");
    expect(screen.getByTestId(NeedsYouCardTestId.Text)).toHaveTextContent("Push it?");
    expect(screen.getByTestId(NeedsYouCardTestId.Rule)).toHaveTextContent("RULE · x");
    expect(screen.getByTestId(NeedsYouCardTestId.Diff)).toHaveTextContent("+b");
    expect(screen.queryByTestId(NeedsYouCardTestId.Approve)).toBeNull();
  });

  it("fires approve / deny and disables both while pending", async () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    const { rerender } = render(
      <NeedsYouCard
        approveLabel="APPROVE"
        denyLabel="DENY"
        heading="H"
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );
    await userEvent.click(screen.getByTestId(NeedsYouCardTestId.Approve));
    await userEvent.click(screen.getByTestId(NeedsYouCardTestId.Deny));
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onDeny).toHaveBeenCalledOnce();
    rerender(
      <NeedsYouCard
        pending
        approveLabel="APPROVE"
        denyLabel="DENY"
        heading="H"
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );
    expect(screen.getByTestId(NeedsYouCardTestId.Approve)).toBeDisabled();
    expect(screen.getByTestId(NeedsYouCardTestId.Deny)).toBeDisabled();
  });
});
