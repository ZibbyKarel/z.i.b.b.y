import type { Meta, StoryObj } from "@storybook/react";
import { Stack, Row } from "./Stack";

const meta: Meta<typeof Stack> = {
  title: "Primitives/Stack",
  component: Stack,
  parameters: { backgrounds: { default: "velin" } },
  args: { direction: "col", gap: "200" },
};
export default meta;

type Story = StoryObj<typeof Stack>;

export const Column: Story = {
  render: () => (
    <Stack direction="col" gap="150">
      {["A", "B", "C"].map((l) => (
        <div key={l} className="rounded border border-border bg-surface-1 px-4 py-2 font-mono text-sm text-foreground-dim">
          {l}
        </div>
      ))}
    </Stack>
  ),
};

export const RowLayout: Story = {
  render: () => (
    <Row gap="150">
      {["A", "B", "C"].map((l) => (
        <div key={l} className="rounded border border-border bg-surface-1 px-4 py-2 font-mono text-sm text-foreground-dim">
          {l}
        </div>
      ))}
    </Row>
  ),
};

export const RowSpaceBetween: Story = {
  render: () => (
    <Row justify="between" style={{ width: "100%" }}>
      <span className="font-mono text-sm text-foreground-dim">Vlevo</span>
      <span className="font-mono text-sm text-foreground-dim">Vpravo</span>
    </Row>
  ),
};

export const Playground: Story = {};
