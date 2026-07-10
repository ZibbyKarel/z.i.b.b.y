"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Stack, Typography } from "@zibby/design-system";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useTriggerAutomationMutation, useUpdateAutomationMutation } from "../../automations/mutations";
import { useAutomationsQuery } from "../../automations/queries";
import { SystemAutomationRow } from "./SystemAutomationRow";

/**
 * `target.type` values a description exists for — the allowlist a target's type is
 * checked against before building an i18n key, so an unknown/future target type (or
 * `pipeline`/`agent`, which aren't system-automation targets) never reaches `t()` and
 * next-intl never throws on a missing message.
 */
const DESCRIBABLE_TARGET_TYPES = [
  "briefing",
  "memory-distill",
  "pattern-extract",
  "gap-detect",
  "agent-factory",
] as const;
type DescribableTargetType = (typeof DESCRIBABLE_TARGET_TYPES)[number];

function isDescribableTargetType(type: string): type is DescribableTargetType {
  return (DESCRIBABLE_TARGET_TYPES as readonly string[]).includes(type);
}

/**
 * System automations ZIBBY seeds itself (memory distillation, etc.) live here
 * instead of on the operator-facing `/automations` page, so the two lists
 * don't mix. Enable/disable works directly from the row — the storage layer
 * allows an `enabled` patch on a system automation; rescheduling still opens
 * the automation's `/automations/:id` detail page (its only other unlocked field).
 */
export function AutomationsSection() {
  const t = useTranslations("settings");
  const router = useRouter();
  const automationsQuery = useAutomationsQuery();
  const update = useUpdateAutomationMutation();
  const trigger = useTriggerAutomationMutation();

  if (automationsQuery.isPending) {
    return (
      <HudPanel padding="300" title={t("automations.title")}>
        <QueryLoading />
      </HudPanel>
    );
  }

  if (automationsQuery.isError) {
    return (
      <HudPanel padding="300" title={t("automations.title")}>
        <QueryError onRetry={() => void automationsQuery.refetch()} />
      </HudPanel>
    );
  }

  const systemAutomations = (automationsQuery.data ?? []).filter((a) => a.system);

  return (
    <HudPanel padding="300" title={t("automations.title")}>
      <Stack gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("automations.hint")}
        </Typography>
        <Stack gap="150">
          {systemAutomations.map((automation) => {
            const targetType = automation.target.type;
            const description = isDescribableTargetType(targetType)
              ? t(`automations.desc.${targetType}`)
              : undefined;

            return (
              <SystemAutomationRow
                automation={automation}
                description={description}
                key={automation.id}
                onEdit={() => router.push(`/automations/${automation.id}`)}
                onToggle={() =>
                  update.mutate({
                    params: { id: automation.id },
                    body: { enabled: !automation.enabled },
                  })
                }
                onTrigger={() => trigger.mutate({ params: { id: automation.id }, body: {} })}
                triggering={trigger.isPending}
              />
            );
          })}
        </Stack>
      </Stack>
    </HudPanel>
  );
}
