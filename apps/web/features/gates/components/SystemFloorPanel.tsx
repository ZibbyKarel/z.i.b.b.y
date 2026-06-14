"use client";

import type { GateRule } from "@zibby/contracts";
import { Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useSystemPolicyQuery } from "../queries";
import { RuleCard } from "./RuleCard";

/**
 * The locked system-policy floor (`POLICY.md`) shown above the editable catalog — the
 * structural guarantee made visible: the deny/ask rules an agent's config can only harden,
 * never weaken (Law 1), and that inbound content can never talk around (Law 4). Read-only
 * (shield, no edit/delete/reorder), reusing the same `RuleCard locked` treatment the agent
 * rules editor uses. Hidden entirely when the floor is empty.
 */
export function SystemFloorPanel() {
  const t = useTranslations("gates");
  const { data: floor = [] } = useSystemPolicyQuery();
  if (floor.length === 0) return null;

  return (
    <HudPanel padding="200" title={t("inheritedTitle")} tone="warn">
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
