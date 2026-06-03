import type { Meta, StoryObj } from "@storybook/react"
import { Card, Container, Typography } from "@zibby/design-system"
import { CardGrid } from "./CardGrid"

const meta: Meta<typeof CardGrid> = {
  title: "Dashboard/CardGrid",
  component: CardGrid,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
  decorators: [
    (Story) => (
      <Container padding="300">
        <Story />
      </Container>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof CardGrid>

const Tile = ({ n }: { n: number }) => (
  <Card background="panel" radius="sm">
    <Container padding="200">
      <Typography mono type="note" variant="secondary">
        karta {n}
      </Typography>
    </Container>
  </Card>
)

export const Default: Story = {
  render: (args) => (
    <CardGrid {...args}>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <Tile key={n} n={n} />
      ))}
    </CardGrid>
  ),
}

export const TwoUp: Story = {
  args: { lg: 2 },
  render: (args) => (
    <CardGrid {...args}>
      {[1, 2, 3, 4].map((n) => (
        <Tile key={n} n={n} />
      ))}
    </CardGrid>
  ),
}
