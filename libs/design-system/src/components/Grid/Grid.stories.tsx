import type { Meta, StoryObj } from "@storybook/react";
import { Card } from "../Card/Card";
import { Container } from "../Container/Container";
import { Grid } from "./Grid";

const meta: Meta<typeof Grid> = {
  title: "Components/Grid",
  component: Grid,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof Grid>;

const cells = Array.from({ length: 6 }, (_, i) => i + 1);

export const Responsive: Story = {
  render: () => (
    <Grid cols={1} sm={2} lg={3} gap="150">
      {cells.map((c) => (
        <Card key={c}>
          <Container padding="200">Cell {c}</Container>
        </Card>
      ))}
    </Grid>
  ),
};

export const MainAside: Story = {
  render: () => (
    <Grid sidebar="right" gap="150" align="start">
      <Card>
        <Container padding="200">Main</Container>
      </Card>
      <Card>
        <Container padding="200">Aside</Container>
      </Card>
    </Grid>
  ),
};
