import type { Meta, StoryObj } from "@storybook/react";
import { GlassSurface } from "./GlassSurface";

const meta: Meta<typeof GlassSurface> = { title: "Immersive/GlassSurface", component: GlassSurface };
export default meta;

export const Pill: StoryObj<typeof GlassSurface> = {
  args: { radius: "pill", children: "⌘K  Search…" },
};
export const Panel: StoryObj<typeof GlassSurface> = {
  args: { radius: "panel", children: "Tool dock" },
};
