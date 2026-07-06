import { describe, expect, it } from "vitest";
import { type RoutableTarget, toTaskTarget } from "./task-router";

describe("toTaskTarget", () => {
  it("preserves avatar when projecting to the wire target", () => {
    const candidate: RoutableTarget = {
      kind: "agent",
      id: "architect",
      name: "Architekt",
      glyph: "compass",
      avatar: "/avatars/architect.png",
      category: "Delivery",
      search: "architect",
    };
    expect(toTaskTarget(candidate).avatar).toBe("/avatars/architect.png");
  });
});
