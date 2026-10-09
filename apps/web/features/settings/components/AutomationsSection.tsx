"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Container, Grid, Stack, Typography } from "@zibby/design-system";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import {
  useTriggerAutomationMutation,
  useUpdateAutomationMutation,
} from "../../automations/mutations";
import { useAutomationsQuery } from "../../automations/queries";
import { SystemAutomationRow } from "./SystemAutomationRow";

/**
 * `/system/automations` — the system automations ZIBBY seeds itself (memory
 * distillation, etc.), kept off the operator-facing `/automations` page so the
 * two lists don't mix. Two columns of rows on wide screens. Enable/disable works
 * directly from the row — the storage layer allows an `enabled` patch on a system
 * automation; rescheduling still opens the automation's `/automations/:id` detail
 * page (its only other unlocked field).
 */
export function AutomationsSection() {
  const t = useTranslations("settings");
  const router = useRouter();
  const automationsQuery = useAutomationsQuery();
  const update = useUpdateAutomationMutation();
  const trigger = useTriggerAutomationMutation();

  const systemAutomations = (automationsQuery.data ?? []).filter((a) => a.system);

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <Stack gap="50">
            <Typography type="h1">{t("automations.title")}</Typography>
            <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
              {t("automations.hint")}
            </Typography>
          </Stack>

          {automationsQuery.isPending ? (
            <QueryLoading />
          ) : automationsQuery.isError ? (
            <QueryError onRetry={() => void automationsQuery.refetch()} />
          ) : (
            <Grid gap="150" lg={2}>
              {systemAutomations.map((automation) => (
                <SystemAutomationRow
                  automation={automation}
                  description={automation.description}
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
              ))}
            </Grid>
          )}
        </Stack>
      </PageContainer>
    </Container>
  );
}
