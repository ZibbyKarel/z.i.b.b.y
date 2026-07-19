"use client";

import type { GateRule } from "@zibby/contracts";
import { Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useSystemPolicyQuery } from "../queries";
import { RuleCard } from "./RuleCard";

export interface SystemFloorPanelProps {
  /**
   * Visual language passthrough (D7) — forwarded from {@link GateRulesSection}'s
   * own `surface` prop so the floor panel and the catalog panels below it never
   * disagree on chrome. Defaults to `"hud"`, so the existing standalone usage
   * (none today — this component is only ever mounted by `GateRulesSection`) is
   * unaffected.
   */
  surface?: "hud" | "glass";
}

/**
 * The locked system-policy floor (`POLICY.md`) shown above the editable catalog — the
 * structural guarantee made visible: the deny/ask rules an agent's config can only harden,
 * never weaken (Law 1), and that inbound content can never talk around (Law 4). Read-only
 * (shield, no edit/delete/reorder), reusing the same `RuleCard locked` treatment the agent
 * rules editor uses. Hidden entirely when the floor is empty.
 */
export function SystemFloorPanel({ surface }: SystemFloorPanelProps = {}) {
  const t = useTranslations("gates");
  const { data: floor = [] } = useSystemPolicyQuery();
  if (floor.length === 0) return null;

  return (
    <HudPanel padding="200" surface={surface} title={t("inheritedTitle")} tone="warn">
      <Stack gap="100">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("inheritedNote")}
        </Typography>
        {floor.map((rule: GateRule) => (
          <RuleCard
            locked
            andLabel={t("and")}
            decisionLabel={t(`decision_.${rule.decision}`)}
            key={rule.id}
            notifyHint={t("notifyHint")}
            rule={rule}
            youLabel={t("you")}
          />
        ))}
      </Stack>
    </HudPanel>
  );
}
