"use client"

import { useState } from "react"
import {
  VelinShell,
  type ContextName,
  type NavItem,
} from "@zibby/design-system"
import {
  NAV_ITEMS,
  NAV_LABELS,
  SETTINGS_ITEM,
} from "./fixtures"
import { useQuotaQuery } from "./queries"
import { OverviewScreen } from "./OverviewScreen"
import { PipelinesScreen } from "./PipelinesScreen"
import { PlaceholderScreen } from "./PlaceholderScreen"

const ALL_NAV: NavItem[] = [...NAV_ITEMS, SETTINGS_ITEM]

/**
 * Top-level velín client: owns context + active screen, renders the shell and
 * routes to the Overview / Orchestrace screens (others use placeholders).
 */
export function VelinApp() {
  const [context, setContext] = useState<ContextName>("home")
  const [nav, setNav] = useState("overview")
  const { data: quota } = useQuotaQuery()

  if (!quota) return null

  const activeItem = ALL_NAV.find((n) => n.id === nav)

  return (
    <VelinShell
      context={context}
      onContextChange={setContext}
      navItems={NAV_ITEMS}
      activeNav={nav}
      onNavigate={setNav}
      footerItem={SETTINGS_ITEM}
      breadcrumb={NAV_LABELS[nav] ?? "Přehled"}
      limits={quota.limits}
      credit={quota.credit}
    >
      {nav === "overview" ? (
        <OverviewScreen context={context} />
      ) : nav === "pipelines" ? (
        <PipelinesScreen context={context} />
      ) : (
        <PlaceholderScreen
          label={NAV_LABELS[nav] ?? "Obrazovka"}
          glyph={activeItem?.glyph ?? "grid"}
        />
      )}
    </VelinShell>
  )
}
