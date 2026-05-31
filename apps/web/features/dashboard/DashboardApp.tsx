"use client";

import { useState } from "react";
import {
  DashboardShell,
  type ContextName,
  type NavItem,
} from "@zibby/design-system";
import {
  AGENT_SDK,
  CLAUDE_LIMITS,
  NAV_ITEMS,
  NAV_LABELS,
  SETTINGS_ITEM,
} from "./config";
import { DashboardStoreProvider } from "./store";
import { OverviewScreen } from "./OverviewScreen";
import { SkillsScreen } from "./SkillsScreen";
import { IntegrationsScreen } from "./IntegrationsScreen";
import { AgentsScreen } from "./AgentsScreen";
import { PipelinesScreen } from "./PipelinesScreen";
import { PlaceholderScreen } from "./PlaceholderScreen";

const ALL_NAV: NavItem[] = [...NAV_ITEMS, SETTINGS_ITEM];

/**
 * Top-level dashboard client: owns context + active screen, provides the (empty)
 * store and routes to each screen. The system starts blank; Skilly, Integrace,
 * Agenti and Orchestrace all support creating new entities via "+ Přidat".
 */
export function DashboardApp() {
  const [context, setContext] = useState<ContextName>("home");
  const [nav, setNav] = useState("overview");

  const activeItem = ALL_NAV.find((n) => n.id === nav);

  return (
    <DashboardStoreProvider>
      <DashboardShell
        context={context}
        onContextChange={setContext}
        navItems={NAV_ITEMS}
        activeNav={nav}
        onNavigate={setNav}
        footerItem={SETTINGS_ITEM}
        breadcrumb={NAV_LABELS[nav] ?? "Přehled"}
        limits={CLAUDE_LIMITS}
        credit={AGENT_SDK}
      >
        {nav === "overview" ? (
          <OverviewScreen context={context} onNavigate={setNav} />
        ) : nav === "skills" ? (
          <SkillsScreen context={context} />
        ) : nav === "integrations" ? (
          <IntegrationsScreen context={context} />
        ) : nav === "agents" ? (
          <AgentsScreen context={context} />
        ) : nav === "pipelines" ? (
          <PipelinesScreen context={context} />
        ) : (
          <PlaceholderScreen
            label={NAV_LABELS[nav] ?? "Obrazovka"}
            glyph={activeItem?.glyph ?? "grid"}
          />
        )}
      </DashboardShell>
    </DashboardStoreProvider>
  );
}
