import type { Meta, StoryObj } from "@storybook/react"
import type { ActivityEvent } from "../../domain"
import { ActivityFeed } from "./ActivityFeed"

const items: ActivityEvent[] = [
  { id: "e1", t: "teď", icon: "run", ctx: "home", text: "tmdb-renamer běží", sub: "přejmenováno 18 / 25 souborů" },
  { id: "e2", t: "2m", icon: "wait", ctx: "home", text: "rohlik čeká na schválení", sub: "košík připraven k objednání" },
  { id: "e3", t: "14m", icon: "ok", ctx: "work", text: "ci-doctor dokončen", sub: "opravil flaky test v auth-svc" },
  { id: "e4", t: "31m", icon: "ok", ctx: "home", text: "holly zálohoval vault", sub: "snapshot home/ · 2.3 GB" },
  { id: "e5", t: "1h", icon: "edit", ctx: "work", text: "standup-gen aktualizoval MEMORY.md", sub: "work/daily/2026-05-30.md" },
]

const meta: Meta<typeof ActivityFeed> = {
  title: "Velín/ActivityFeed",
  component: ActivityFeed,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [(Story) => <div className="w-[360px]"><Story /></div>],
  args: { items },
}
export default meta

type Story = StoryObj<typeof ActivityFeed>

export const Default: Story = {}
