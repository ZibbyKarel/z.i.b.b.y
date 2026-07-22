import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreOrbTestId } from "../CoreOrb/CoreOrb";
import {
  DEFAULT_DURATION_MS,
  HandoffFlareTestId,
  RETIRE_BUFFER_MS,
} from "../HandoffFlare/HandoffFlare";
import { OrbNodeTestId } from "../OrbNode/OrbNode";
import type { OrbState } from "../orbState";
import { ORB_MAP_CORE_ID, OrbMap, type OrbMapCore, type OrbMapNode, OrbMapTestId } from "./OrbMap";

// jsdom ships no ResizeObserver — the shared vitest setup already polyfills it, but
// this test file stays self-sufficient in case it ever runs standalone.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const NODE_IDS = ["atlas", "forge", "scribe", "sentry", "mint", "relay", "codex", "scout"];

function buildNodes(): OrbMapNode[] {
  const states: OrbState[] = [
    "idle",
    "working",
    "report",
    "await",
    "incident",
    "thinking",
    "idle",
    "working",
  ];
  return NODE_IDS.map((id, i) => ({
    id,
    hex: "#5b8def",
    state: states[i] ?? "idle",
    label: id,
    icon: <span>{id}</span>,
    activeCount: i,
  }));
}

const CORE: OrbMapCore = { hex: "#5b8def", activeCount: 4, intensity: 0.4, thinking: false };

describe("OrbMap", () => {
  it("renders one node wrapper per node plus the core", () => {
    render(<OrbMap core={CORE} nodes={buildNodes()} />);
    for (const id of NODE_IDS) {
      expect(screen.getByTestId(`${OrbMapTestId.Node}-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId(OrbMapTestId.Core)).toBeInTheDocument();
  });

  it("fires onSelectNode with the clicked node's id", async () => {
    const user = userEvent.setup();
    const onSelectNode = vi.fn();
    render(<OrbMap core={CORE} nodes={buildNodes()} onSelectNode={onSelectNode} />);
    const forgeWrapper = screen.getByTestId(`${OrbMapTestId.Node}-forge`);
    const forgeRoot = within(forgeWrapper).getByTestId(OrbNodeTestId.Root);
    await user.click(forgeRoot);
    expect(onSelectNode).toHaveBeenCalledTimes(1);
    expect(onSelectNode).toHaveBeenCalledWith("forge");
  });

  it("fires onSelectCore when the core is activated", async () => {
    const user = userEvent.setup();
    const onSelectCore = vi.fn();
    render(<OrbMap core={CORE} nodes={buildNodes()} onSelectCore={onSelectCore} />);
    const coreWrapper = screen.getByTestId(OrbMapTestId.Core);
    const coreRoot = within(coreWrapper).getByTestId(CoreOrbTestId.Root);
    await user.click(coreRoot);
    expect(onSelectCore).toHaveBeenCalledTimes(1);
  });

  it("renders a HandoffFlare for a flare with known fromId/toId", () => {
    render(
      <OrbMap
        core={CORE}
        flares={[{ id: "flare-1", fromId: "atlas", toId: "forge" }]}
        nodes={buildNodes()}
      />,
    );
    expect(screen.getByTestId(HandoffFlareTestId.Root)).toBeInTheDocument();
  });

  it("renders a HandoffFlare between a node and the reserved core id", () => {
    render(
      <OrbMap
        core={CORE}
        flares={[{ id: "flare-core", fromId: ORB_MAP_CORE_ID, toId: "forge" }]}
        nodes={buildNodes()}
      />,
    );
    expect(screen.getByTestId(HandoffFlareTestId.Root)).toBeInTheDocument();
  });

  it("renders nothing for a flare referencing an unknown node id", () => {
    render(
      <OrbMap
        core={CORE}
        flares={[{ id: "flare-2", fromId: "atlas", toId: "unknown-node" }]}
        nodes={buildNodes()}
      />,
    );
    expect(screen.queryByTestId(HandoffFlareTestId.Root)).toBeNull();
  });

  describe("onFlareDone", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("reports the flare's id once its lifetime ends", () => {
      const onFlareDone = vi.fn();
      render(
        <OrbMap
          core={CORE}
          flares={[{ id: "flare-1", fromId: "atlas", toId: "forge" }]}
          nodes={buildNodes()}
          onFlareDone={onFlareDone}
        />,
      );
      expect(onFlareDone).not.toHaveBeenCalled();
      vi.advanceTimersByTime(DEFAULT_DURATION_MS + RETIRE_BUFFER_MS);
      expect(onFlareDone).toHaveBeenCalledTimes(1);
      expect(onFlareDone).toHaveBeenCalledWith("flare-1");
    });
  });
});
