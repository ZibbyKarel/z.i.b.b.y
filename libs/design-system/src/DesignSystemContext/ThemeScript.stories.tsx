import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../components/Typography/Typography";
import { ThemeScript, buildThemeScriptSource } from "./ThemeScript";

const meta: Meta<typeof ThemeScript> = {
  title: "DesignSystem/ThemeScript",
  component: ThemeScript,
  args: { fallback: "dark" },
};
export default meta;

type Story = StoryObj<typeof ThemeScript>;

/**
 * `ThemeScript` renders an inert `<script>` — there's nothing to see in the canvas
 * (its whole job is running before hydration, in `<head>`). The Overview instead
 * shows the source it emits, so a reviewer can read exactly what runs.
 */
export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-8 p-12">
      <div className="flex flex-col gap-3">
        <Typography type="label">emitted source — fallback: dark</Typography>
        <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-4 font-mono text-xs text-foreground-dim">
          {buildThemeScriptSource("dark")}
        </pre>
      </div>
      <div className="flex flex-col gap-3">
        <Typography type="label">emitted source — fallback: light</Typography>
        <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-4 font-mono text-xs text-foreground-dim">
          {buildThemeScriptSource("light")}
        </pre>
      </div>
      {/* The real component, mounted inertly — proves it renders without throwing. */}
      <ThemeScript />
    </div>
  ),
};

export const Playground: Story = {};
