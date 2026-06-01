import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Stack, Row } from "./Stack";

const meta: Meta<typeof Stack> = {
  title: "Primitives/Stack",
  component: Stack,
  parameters: { backgrounds: { default: "velin" } },
  args: { direction: "col", gap: "200" },
};
export default meta;

type Story = StoryObj<typeof Stack>;

const box = (label: string) => (
  <div
    key={label}
    className="rounded border border-border bg-surface px-4 py-2 font-mono text-sm text-foreground-dim"
  >
    {label}
  </div>
);

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          Stack col
        </Typography>
        <Stack direction="col" gap="150">
          {["A", "B", "C"].map(box)}
        </Stack>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          Row
        </Typography>
        <Row gap="150">{["A", "B", "C"].map(box)}</Row>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          Row justify=between
        </Typography>
        <Row justify="between" style={{ width: "100%" }}>
          <span className="font-mono text-sm text-foreground-dim">Vlevo</span>
          <span className="font-mono text-sm text-foreground-dim">Vpravo</span>
        </Row>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
