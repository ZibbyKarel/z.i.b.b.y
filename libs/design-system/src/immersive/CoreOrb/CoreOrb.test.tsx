import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetImmersiveCss } from "../immersive.css";
import { CoreOrb, CoreOrbTestId } from "./CoreOrb";

afterEach(() => resetImmersiveCss());

describe("CoreOrb", () => {
  it("renders the Z·I·B·B·Y wordmark", () => {
    render(<CoreOrb size={200} />);
    expect(screen.getByTestId(CoreOrbTestId.Wordmark)).toHaveTextContent("Z·I·B·B·Y");
  });

  it("renders two heartbeat rings", () => {
    render(<CoreOrb size={200} />);
    const rings = screen.getAllByTestId(new RegExp(`^${CoreOrbTestId.Ring}-`));
    expect(rings).toHaveLength(2);
  });

  it("fires onClick when the root is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<CoreOrb onClick={onClick} size={200} />);
    await user.click(screen.getByTestId(CoreOrbTestId.Root));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires onClick on Enter and Space (keyboard-accessible)", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<CoreOrb onClick={onClick} size={200} />);
    const root = screen.getByTestId(CoreOrbTestId.Root);
    root.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("exposes a button role and accessible name on the root", () => {
    render(<CoreOrb size={200} />);
    const root = screen.getByTestId(CoreOrbTestId.Root);
    expect(root).toHaveRole("button");
    expect(root).toHaveAccessibleName("ZIBBY overview");
  });

  it("renders without crashing and keeps the wordmark under both thinking values", () => {
    const { rerender } = render(<CoreOrb size={200} thinking={false} />);
    expect(screen.getByTestId(CoreOrbTestId.Wordmark)).toHaveTextContent("Z·I·B·B·Y");
    expect(screen.getByTestId(CoreOrbTestId.Orb)).toBeInTheDocument();

    rerender(<CoreOrb size={200} thinking={true} />);
    expect(screen.getByTestId(CoreOrbTestId.Wordmark)).toHaveTextContent("Z·I·B·B·Y");
    expect(screen.getByTestId(CoreOrbTestId.Orb)).toBeInTheDocument();
  });

  it("brightens the glow while thinking (heartbeat cadence input differs)", () => {
    const { container: idleContainer } = render(<CoreOrb size={200} thinking={false} />);
    const idleGlow = idleContainer.querySelectorAll("span")[2];
    const { container: thinkingContainer } = render(<CoreOrb size={200} thinking={true} />);
    const thinkingGlow = thinkingContainer.querySelectorAll("span")[2];
    expect(idleGlow?.style.background).not.toEqual(thinkingGlow?.style.background);
  });
});
