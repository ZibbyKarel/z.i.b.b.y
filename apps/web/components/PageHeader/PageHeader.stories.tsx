import type { Meta, StoryObj } from "@storybook/react"
import { Button, Container, Stack } from "@zibby/design-system"
import { PageHeader } from "./PageHeader"

const meta: Meta<typeof PageHeader> = {
  title: "Dashboard/PageHeader",
  component: PageHeader,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
  decorators: [
    (Story) => (
      <Container padding="300">
        <Story />
      </Container>
    ),
  ],
  args: { title: "Agenti", subtitle: "4 agenti v katalogu" },
}
export default meta

type Story = StoryObj<typeof PageHeader>

export const Default: Story = {}

export const WithActions: Story = {
  args: {
    actions: (
      <Stack align="center" direction="row" gap="100">
        <Button icon="plus" intent="ghost">
          Přidat kategorii
        </Button>
        <Button icon="plus" intent="primary">
          Přidat agenta
        </Button>
      </Stack>
    ),
  },
}
