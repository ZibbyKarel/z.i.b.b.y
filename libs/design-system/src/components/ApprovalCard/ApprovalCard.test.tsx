import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { IconTileTestId } from "../IconTile/IconTile";
import { ApprovalCard, ApprovalCardTestId } from "./ApprovalCard";

describe("ApprovalCard", () => {
  it("tints the symbol with the given color", () => {
    render(
      <ApprovalCard agentName="K" color="#5b8def" glyph="code" meta="m" request="r" waited="w" />,
    );
    expect(screen.getByTestId(IconTileTestId.Root).style.color).toBe("rgb(91, 141, 239)");
  });

  it("renders identity, meta, wait and request text (card density)", () => {
    render(
      <ApprovalCard
        agentName="Kevin"
        meta="TASK · RND"
        request="Research artifact ready for review."
        waited="12m"
      />,
    );
    expect(screen.getByTestId(ApprovalCardTestId.Name)).toHaveTextContent("Kevin");
    expect(screen.getByTestId(ApprovalCardTestId.Meta)).toHaveTextContent("TASK · RND");
    expect(screen.getByTestId(ApprovalCardTestId.Waited)).toHaveTextContent("12m");
    expect(screen.getByTestId(ApprovalCardTestId.Request)).toHaveTextContent(
      "Research artifact ready for review.",
    );
  });

  it("renders the taskRef line only when provided", () => {
    const { rerender } = render(<ApprovalCard agentName="Kevin" meta="m" request="r" waited="w" />);
    expect(screen.queryByTestId(ApprovalCardTestId.TaskRef)).toBeNull();

    rerender(
      <ApprovalCard agentName="Kevin" meta="m" request="r" taskRef="TASK · dev-142" waited="w" />,
    );
    expect(screen.getByTestId(ApprovalCardTestId.TaskRef)).toHaveTextContent("TASK · dev-142");
  });

  it("calls onApprove/onDeny directly and onOpen from the whole-card click target", async () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    const onOpen = vi.fn();
    render(
      <ApprovalCard
        agentName="Kevin"
        meta="m"
        onApprove={onApprove}
        onDeny={onDeny}
        onOpen={onOpen}
        request="r"
        waited="w"
      />,
    );
    await userEvent.click(screen.getByTestId(ApprovalCardTestId.Approve));
    await userEvent.click(screen.getByTestId(ApprovalCardTestId.Deny));
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onDeny).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId(ApprovalCardTestId.Open));
    expect(onOpen).toHaveBeenCalledOnce();
    // Approve/deny stay separate actions — the card-open click never re-triggers them.
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onDeny).toHaveBeenCalledOnce();
  });

  it("omits the whole-card click target when onOpen isn't given", () => {
    render(<ApprovalCard agentName="Kevin" meta="m" request="r" waited="w" />);
    expect(screen.queryByTestId(ApprovalCardTestId.Open)).toBeNull();
  });

  it("approve stays a single click even when highRisk is set (D-013/D-014)", async () => {
    const onApprove = vi.fn();
    render(
      <ApprovalCard
        highRisk
        agentName="Kevin"
        meta="m"
        onApprove={onApprove}
        request="r"
        waited="w"
      />,
    );
    const approve = screen.getByTestId(ApprovalCardTestId.Approve);
    expect(approve.tagName).toBe("BUTTON");
    await userEvent.click(approve);
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it("shows a visible high-risk marker without gating approval behind a hold", () => {
    render(<ApprovalCard highRisk agentName="Kevin" meta="m" request="r" waited="w" />);
    expect(screen.getByTestId(ApprovalCardTestId.HighRisk)).toHaveTextContent("High risk");
  });

  it("omits the high-risk marker by default", () => {
    render(<ApprovalCard agentName="Kevin" meta="m" request="r" waited="w" />);
    expect(screen.queryByTestId(ApprovalCardTestId.HighRisk)).toBeNull();
  });

  it("gives the approve/deny/open buttons accessible names", () => {
    render(<ApprovalCard agentName="Kevin" meta="m" onOpen={() => {}} request="r" waited="w" />);
    expect(screen.getByTestId(ApprovalCardTestId.Approve)).toHaveAccessibleName("Approve");
    expect(screen.getByTestId(ApprovalCardTestId.Deny)).toHaveAccessibleName("Deny");
    expect(screen.getByTestId(ApprovalCardTestId.Open)).toHaveAccessibleName("Open");
  });

  it("disables and shows a loading state on both actions while one is pending", () => {
    render(<ApprovalCard approvePending agentName="Kevin" meta="m" request="r" waited="w" />);
    expect(screen.getByTestId(ApprovalCardTestId.Approve)).toBeDisabled();
    expect(screen.getByTestId(ApprovalCardTestId.Approve)).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId(ApprovalCardTestId.Deny)).toBeDisabled();
  });

  it("renders the compact row density with icon-only actions", () => {
    render(<ApprovalCard agentName="Kevin" density="row" meta="m" request="r" waited="w" />);
    expect(screen.getByTestId(ApprovalCardTestId.Root)).toHaveAttribute("data-density", "row");
    expect(screen.queryByTestId(ApprovalCardTestId.Request)).toBeNull();
  });

  it("lets the action labels be overridden", () => {
    render(
      <ApprovalCard
        agentName="Kevin"
        approveLabel="Schválit"
        denyLabel="Zamítnout"
        meta="m"
        onOpen={() => {}}
        openLabel="Otevřít"
        request="r"
        waited="w"
      />,
    );
    expect(screen.getByTestId(ApprovalCardTestId.Approve)).toHaveAccessibleName("Schválit");
    expect(screen.getByTestId(ApprovalCardTestId.Deny)).toHaveAccessibleName("Zamítnout");
    expect(screen.getByTestId(ApprovalCardTestId.Open)).toHaveAccessibleName("Otevřít");
  });
});
