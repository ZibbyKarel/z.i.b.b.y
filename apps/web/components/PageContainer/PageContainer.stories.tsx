import type { Meta, StoryObj } from "@storybook/react"
import { Card, Container, Typography } from "@zibby/design-system"
import { PageContainer } from "./PageContainer"

const meta: Meta<typeof PageContainer> = {
  title: "Dashboard/PageContainer",
  component: PageContainer,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
}
export default meta

type Story = StoryObj<typeof PageContainer>

export const Default: Story = {
  render: (args) => (
    <PageContainer {...args}>
      <Card background="panel" radius="sm">
        <Container padding="300">
          <Typography type="note" variant="secondary">
            Vycentrovaný sloupec s maximální šířkou 1400px — sdílený obal stránek
            dashboardu.
          </Typography>
        </Container>
      </Card>
    </PageContainer>
  ),
}
