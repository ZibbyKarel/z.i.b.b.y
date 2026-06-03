import type { Meta, StoryObj } from "@storybook/react"
import { Container, type NavItem, Typography } from "@zibby/design-system"
import { MainLayout } from "./MainLayout"

const navItems: NavItem[] = [
  { id: "overview", glyph: "flow", href: "/overview", label: "Přehled" },
  { id: "skills", glyph: "spark", href: "/skills", label: "Skilly" },
  { id: "agents", glyph: "bot", href: "/agents", label: "Agenti" },
]

const meta: Meta<typeof MainLayout> = {
  title: "Dashboard/Layout/MainLayout",
  component: MainLayout,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
  args: {
    navItems,
    activeNav: "overview",
    breadcrumb: "Přehled",
    children: (
      <Container padding="300">
        <Typography type="note" variant="secondary">
          Obsah stránky se vykresluje uvnitř shellu (sidebar + top bar).
        </Typography>
      </Container>
    ),
  },
}
export default meta

type Story = StoryObj<typeof MainLayout>

export const Default: Story = {}
