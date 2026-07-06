import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { ChatOrb, type ChatOrbMode, ChatOrbTestId } from "./ChatOrb";

/**
 * `ChatOrb` never mounts WebGL in jsdom (component tests): `ChatOrbSphere`'s
 * `canMountWebGL()` reads `false` (no `getContext("webgl")` in jsdom), so the
 * lazy-loaded sphere renders `null` and the static core fallback
 * ({@link ChatOrbTestId.Fallback}) is the whole visible surface — see the phase-15
 * plan's Rozhodnutí 10 and `ChatOrbSphere.tsx`'s `canMountWebGL` doc comment. These
 * tests only assert the wrapper's testid/`data-mode` contract and that the fallback
 * always renders, for every mode in the union (Rozhodnutí 4).
 */
const ALL_MODES: ChatOrbMode[] = [
  "idle",
  "listening",
  "thinking",
  "streaming",
  "tool",
  "waiting-approval",
  "error",
];

describe("ChatOrb", () => {
  it.each(ALL_MODES)("renders the root + fallback core with data-mode=%s", (mode) => {
    renderWithProviders(<ChatOrb mode={mode} />);

    const root = screen.getByTestId(ChatOrbTestId.Root);
    expect(root).toHaveAttribute("data-mode", mode);
    expect(screen.getByTestId(ChatOrbTestId.Fallback)).toBeInTheDocument();
  });

  it("defaults to idle when no mode is given", () => {
    renderWithProviders(<ChatOrb />);
    expect(screen.getByTestId(ChatOrbTestId.Root)).toHaveAttribute("data-mode", "idle");
  });
});
