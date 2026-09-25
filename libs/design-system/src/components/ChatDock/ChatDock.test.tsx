import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { ChatDock, ChatDockTestId } from "./ChatDock";

describe("ChatDock", () => {
  it("renders collapsed by default, hiding the transcript", () => {
    render(<ChatDock composer={<input aria-label="Message" />} />);
    expect(screen.queryByTestId(ChatDockTestId.Transcript)).toBeNull();
    expect(screen.getByTestId(ChatDockTestId.Toggle)).toHaveAttribute("aria-expanded", "false");
  });

  it("renders the composer slot regardless of open state", () => {
    render(<ChatDock composer={<input aria-label="Message" />} />);
    expect(screen.getByTestId(ChatDockTestId.Composer)).toContainElement(
      screen.getByLabelText("Message"),
    );
  });

  it("expands on toggle click (uncontrolled)", async () => {
    const user = userEvent.setup();
    render(
      <ChatDock composer={<input aria-label="Message" />} transcript={<div>Hi there</div>} />,
    );
    await user.click(screen.getByTestId(ChatDockTestId.Toggle));
    expect(screen.getByTestId(ChatDockTestId.Transcript)).toHaveTextContent("Hi there");
    expect(screen.getByTestId(ChatDockTestId.Toggle)).toHaveAttribute("aria-expanded", "true");
  });

  it("closes via the header close button", async () => {
    const user = userEvent.setup();
    render(
      <ChatDock
        defaultOpen
        composer={<input aria-label="Message" />}
        transcript={<div>Hi there</div>}
      />,
    );
    expect(screen.getByTestId(ChatDockTestId.Transcript)).toBeInTheDocument();
    await user.click(screen.getByTestId(ChatDockTestId.CloseButton));
    expect(screen.queryByTestId(ChatDockTestId.Transcript)).toBeNull();
  });

  it("is controlled via open + onOpenChange", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatDock composer={<input aria-label="Message" />} onOpenChange={onOpenChange} open={false} />,
    );
    await user.click(screen.getByTestId(ChatDockTestId.Toggle));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    // Controlled: stays collapsed until the parent flips `open`.
    expect(screen.queryByTestId(ChatDockTestId.Transcript)).toBeNull();
  });

  it("shows the latest-line preview only while collapsed", () => {
    const { rerender } = render(
      <ChatDock composer={<input aria-label="Message" />} latestLine="On it." open={false} />,
    );
    expect(screen.getByTestId(ChatDockTestId.LatestLine)).toHaveTextContent("On it.");
    rerender(<ChatDock open composer={<input aria-label="Message" />} latestLine="On it." />);
    expect(screen.queryByTestId(ChatDockTestId.LatestLine)).toBeNull();
  });

  it("renders the target chip slot when provided", () => {
    render(
      <ChatDock composer={<input aria-label="Message" />} targetChip={<span>Dept: dev</span>} />,
    );
    expect(screen.getByTestId(ChatDockTestId.TargetChip)).toHaveTextContent("Dept: dev");
  });

  it("renders agentName and roleLabel in the expanded header", () => {
    render(
      <ChatDock
        defaultOpen
        agentName="Bob"
        composer={<input aria-label="Message" />}
        roleLabel="CTO · Ships the roadmap"
      />,
    );
    expect(screen.getByTestId(ChatDockTestId.Title)).toHaveTextContent("Bob");
    expect(screen.getByTestId(ChatDockTestId.Role)).toHaveTextContent("CTO · Ships the roadmap");
  });
});
