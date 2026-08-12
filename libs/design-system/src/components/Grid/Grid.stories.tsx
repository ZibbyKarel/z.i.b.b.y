import type { Meta, StoryObj } from "@storybook/react";
import { Card } from "../Card/Card";
import { Container } from "../Container/Container";
import { Grid } from "./Grid";

const meta: Meta<typeof Grid> = {
  title: "DesignSystem/Grid",
  component: Grid,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    cols: { control: "select", options: [1, 2, 3, 4, 5] },
    sm: { control: "select", options: [undefined, 1, 2, 3, 4, 5] },
    md: { control: "select", options: [undefined, 1, 2, 3, 4, 5] },
    lg: { control: "select", options: [undefined, 1, 2, 3, 4, 5] },
    sidebar: { control: "select", options: [undefined, "left", "left-wide", "right"] },
    align: { control: "select", options: [undefined, "start", "center", "end", "stretch"] },
    gap: { control: "select", options: ["0", "50", "100", "150", "200", "300"] },
  },
  args: { cols: 1, sm: 2, lg: 3, gap: "150" },
};
export default meta;

type Story = StoryObj<typeof Grid>;

const cells = Array.from({ length: 6 }, (_, i) => i + 1);

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Grid cols={1} gap="150" lg={3} sm={2}>
          {cells.map((c) => (
            <Card key={c}>
              <Container padding="200">Cell {c}</Container>
            </Card>
          ))}
        </Grid>
      </div>
      <div className="flex flex-col gap-2">
        <Grid align="start" gap="150" sidebar="right">
          <Card>
            <Container padding="200">Main</Container>
          </Card>
          <Card>
            <Container padding="200">Aside</Container>
          </Card>
        </Grid>
      </div>
      <div className="flex flex-col gap-2">
        <Grid align="start" gap="300" sidebar="left-wide">
          <Card>
            <Container padding="200">List (~33%)</Container>
          </Card>
          <Card>
            <Container padding="200">Content</Container>
          </Card>
        </Grid>
      </div>
    </div>
  ),
};

export const Playground: Story = {
  render: (args) => (
    <Grid {...args}>
      {cells.map((c) => (
        <Card key={c}>
          <Container padding="200">Cell {c}</Container>
        </Card>
      ))}
    </Grid>
  ),
};
