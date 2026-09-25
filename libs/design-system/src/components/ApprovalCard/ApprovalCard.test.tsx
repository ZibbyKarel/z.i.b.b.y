import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { ApprovalCard, ApprovalCardTestId } from "./ApprovalCard";

describe("ApprovalCard", () => {
  it("renders identity, meta, wait and request text (card density)", () => {
    render(
      <ApprovalCard
        agentName="Kevin"
        glyphSeed="kevin-1"
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
    const { rerender } = render(
      <ApprovalCard agentName="Kevin" glyphSeed="s" meta="m" request="r" waited="w" />,
    );
    expect(screen.queryByTestId(ApprovalCardTestId.TaskRef)).toBeNull();

    rerender(
      <ApprovalCard
        agentName="Kevin"
        glyphSeed="s"
        meta="m"
        request="r"
        taskRef="TASK · dev-142"
        waited="w"
      />,
    );
    expect(screen.getByTestId(ApprovalCardTestId.TaskRef)).toHaveTextContent("TASK · dev-142");
  });

  it("calls onApprove/onDeny/onOpen from the card action row", async () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    const onOpen = vi.fn();
    render(
      <ApprovalCard
        agentName="Kevin"
        glyphSeed="s"
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
    await userEvent.click(screen.getByTestId(ApprovalCardTestId.Open));
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onDeny).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("approve stays a single click even when highRisk is set (D-013/D-014)", async () => {
    const onApprove = vi.fn();
    render(
      <ApprovalCard
        highRisk
        agentName="Kevin"
        glyphSeed="s"
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
    render(
      <ApprovalCard highRisk agentName="Kevin" glyphSeed="s" meta="m" request="r" waited="w" />,
    );
    expect(screen.getByTestId(ApprovalCardTestId.HighRisk)).toHaveTextContent("High risk");
  });

  it("omits the high-risk marker by default", () => {
    render(<ApprovalCard agentName="Kevin" glyphSeed="s" meta="m" request="r" waited="w" />);
    expect(screen.queryByTestId(ApprovalCardTestId.HighRisk)).toBeNull();
  });

  it("gives the approve/deny/open buttons accessible names", () => {
    render(<ApprovalCard agentName="Kevin" glyphSeed="s" meta="m" request="r" waited="w" />);
    expect(screen.getByTestId(ApprovalCardTestId.Approve)).toHaveAccessibleName("Approve");
    expect(screen.getByTestId(ApprovalCardTestId.Deny)).toHaveAccessibleName("Deny");
    expect(screen.getByTestId(ApprovalCardTestId.Open)).toHaveAccessibleName("Open");
  });

  it("renders the compact row density with icon-only actions", () => {
    render(
      <ApprovalCard
        agentName="Kevin"
        density="row"
        glyphSeed="s"
        meta="m"
        request="r"
        waited="w"
      />,
    );
    expect(screen.getByTestId(ApprovalCardTestId.Root)).toHaveAttribute("data-density", "row");
    expect(screen.queryByTestId(ApprovalCardTestId.Request)).toBeNull();
  });

  it("lets the action labels be overridden", () => {
    render(
      <ApprovalCard
        agentName="Kevin"
        approveLabel="Schválit"
        denyLabel="Zamítnout"
        glyphSeed="s"
        meta="m"
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
