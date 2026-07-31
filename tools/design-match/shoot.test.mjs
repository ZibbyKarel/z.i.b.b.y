import { describe, expect, it } from "vitest";
import { resolveScene, storybookUrl } from "./shoot.mjs";

describe("storybookUrl", () => {
  it("builds an iframe url so the Storybook chrome is not in the shot", () => {
    expect(storybookUrl("components-button--primary")).toBe(
      "http://localhost:6006/iframe.html?id=components-button--primary&viewMode=story",
    );
  });
});

describe("resolveScene", () => {
  it("prefers the story mode when a story id is given", () => {
    const scene = resolveScene({ story: "ds-card--default", selector: "#storybook-root > *" });
    expect(scene.mode).toBe("story");
    expect(scene.url).toContain("id=ds-card--default");
  });

  it("uses the route mode with the app base url", () => {
    const scene = resolveScene({ route: "/roadmap", selector: "[data-region=card]" });
    expect(scene).toMatchObject({ mode: "route", url: "http://localhost:3000/roadmap" });
  });

  it("switches to mask mode when masks are supplied and records them", () => {
    const scene = resolveScene({ route: "/roadmap", selector: "main", masks: [".relative-time"] });
    expect(scene.mode).toBe("mask");
    expect(scene.masks).toEqual([".relative-time"]);
  });

  it("throws when neither story nor route is given", () => {
    expect(() => resolveScene({ selector: "main" })).toThrow(/--story|--route/);
  });

  // Pinning the brief's asymmetry: a story scene's masks are still recorded and
  // will still be applied by shootScene, but the mode stays "story" rather than
  // flipping to "mask" the way a route's masks do. This is documented behaviour,
  // not an oversight — see task-10-brief.md ruling 3.
  it("pins the asymmetry: masks alongside a story leave mode as story but still record the masks", () => {
    const scene = resolveScene({
      story: "ds-card--default",
      selector: "#storybook-root > *",
      masks: [".relative-time"],
    });
    expect(scene.mode).toBe("story");
    expect(scene.masks).toEqual([".relative-time"]);
  });

  // Fix round 1, Minor: a route typed without a leading slash used to concatenate
  // straight onto appBase with no separator (`http://localhost:3000roadmap`) —
  // no error, just a URL that will never resolve. Normalise to one leading slash.
  it("normalises a route given without a leading slash so it doesn't collide with appBase", () => {
    const scene = resolveScene({ route: "roadmap", selector: "main" });
    expect(scene.url).toBe("http://localhost:3000/roadmap");
  });
});
