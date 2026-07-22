import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetImmersiveCss } from "../immersive.css";
import type { OrbState } from "../orbState";
import { OrbNode, OrbNodeTestId } from "./OrbNode";

afterEach(() => resetImmersiveCss());

const NON_PING_STATES: OrbState[] = ["idle", "working", "thinking"];
const PING_STATES: OrbState[] = ["await", "incident", "report"];

describe("OrbNode", () => {
  it("renders the label, with no status text node", () => {
    render(
      <OrbNode
        activeCount={2}
        diameter={72}
        hex="#5b8def"
        icon={<span>icon</span>}
        label="Forge"
        nodeId="forge"
        state="working"
      />,
    );
    expect(screen.getByTestId(OrbNodeTestId.Label)).toHaveTextContent("Forge");
    expect(screen.queryByTestId("orb-node-status")).toBeNull();
  });

  it("defaults the accessible name to the visible label", () => {
    render(
      <OrbNode
        activeCount={0}
        diameter={72}
        hex="#5b8def"
        icon={<span>icon</span>}
        label="Forge"
        nodeId="forge"
        state="working"
      />,
    );
    expect(screen.getByTestId(OrbNodeTestId.Root)).toHaveAccessibleName("Forge");
  });

  it("uses ariaLabel over the visible label when supplied", () => {
    render(
      <OrbNode
        activeCount={0}
        ariaLabel="Forge, Working"
        diameter={72}
        hex="#5b8def"
        icon={<span>icon</span>}
        label="Forge"
        nodeId="forge"
        state="working"
      />,
    );
    expect(screen.getByTestId(OrbNodeTestId.Root)).toHaveAccessibleName("Forge, Working");
  });

  it("passes the icon slot the exact node supplied", () => {
    render(
      <OrbNode
        activeCount={0}
        diameter={72}
        hex="#5b8def"
        icon={<span data-testid="custom-icon">glyph</span>}
        label="Scout"
        nodeId="scout"
        state="idle"
      />,
    );
    expect(
      within(screen.getByTestId(OrbNodeTestId.Icon)).getByTestId("custom-icon"),
    ).toHaveTextContent("glyph");
  });

  it("always renders the halo", () => {
    render(
      <OrbNode
        activeCount={0}
        diameter={72}
        hex="#5b8def"
        icon={<span>icon</span>}
        label="Atlas"
        nodeId="atlas"
        state="idle"
      />,
    );
    expect(screen.getByTestId(OrbNodeTestId.Halo)).toBeInTheDocument();
  });

  it.each(PING_STATES)("renders the attention ping for state=%s", (state) => {
    render(
      <OrbNode
        activeCount={0}
        diameter={72}
        hex="#5b8def"
        icon={<span>icon</span>}
        label="Sentry"
        nodeId="sentry"
        state={state}
      />,
    );
    expect(screen.getByTestId(OrbNodeTestId.Ping)).toBeInTheDocument();
  });

  it.each(NON_PING_STATES)("omits the attention ping for state=%s", (state) => {
    render(
      <OrbNode
        activeCount={0}
        diameter={72}
        hex="#5b8def"
        icon={<span>icon</span>}
        label="Mint"
        nodeId="mint"
        state={state}
      />,
    );
    expect(screen.queryByTestId(OrbNodeTestId.Ping)).toBeNull();
  });

  it("fires onClick when activated", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <OrbNode
        activeCount={0}
        diameter={72}
        hex="#5b8def"
        icon={<span>icon</span>}
        label="Relay"
        nodeId="relay"
        onClick={onClick}
        state="idle"
      />,
    );
    await user.click(screen.getByTestId(OrbNodeTestId.Root));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires onClick on Enter and Space (keyboard-accessible)", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <OrbNode
        activeCount={0}
        diameter={72}
        hex="#5b8def"
        icon={<span>icon</span>}
        label="Relay"
        nodeId="relay"
        onClick={onClick}
        state="idle"
      />,
    );
    const root = screen.getByTestId(OrbNodeTestId.Root);
    root.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("exposes button role and an accessible name matching the label", () => {
    render(
      <OrbNode
        activeCount={0}
        diameter={72}
        hex="#5b8def"
        icon={<span>icon</span>}
        label="Relay"
        nodeId="relay"
        state="idle"
      />,
    );
    expect(screen.getByTestId(OrbNodeTestId.Root)).toHaveRole("button");
    expect(screen.getByTestId(OrbNodeTestId.Root)).toHaveAccessibleName("Relay");
  });
});
