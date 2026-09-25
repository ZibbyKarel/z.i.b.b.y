"use client";

import { useMemo, useState } from "react";
import type { Automation } from "@zibby/contracts";
import {
  Button,
  Container,
  Grid,
  List,
  ListItem,
  ListItemText,
  Panel,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useAutomationsQuery } from "../../automations/queries";
import { useTriggerAutomationMutation } from "../../automations/mutations";
import { relativeLabel } from "../../automations/schedule";
import { useCronLabel } from "../../automations/useCronLabel";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { SelfKnowledgeSection } from "../components/SelfKnowledgeSection";

/** The two department-owned (KNW) distillation automation targets this screen covers. */
const DISTILL_TARGET_TYPES = ["memory-distill", "gap-detect"] as const;
type DistillTargetType = (typeof DISTILL_TARGET_TYPES)[number];
function isDistillTarget(type: string): type is DistillTargetType {
  return (DISTILL_TARGET_TYPES as readonly string[]).includes(type);
}

/**
 * One triggered run's outcome, kept in local screen state only — recon (ZB-09)
 * found no persisted run history for an automation beyond `lastFiredAt`: the
 * trigger endpoint returns a `runRef` synchronously and nothing else is stored.
 * Showing more than that would invent fields the backend doesn't have.
 */
interface RunLogLine {
  automationId: string;
  at: string;
  ref: string;
}

export function DistillScreen() {
  const t = useTranslations("knowledge");
  const ta = useTranslations("settings");
  const locale = useLocale();
  const cronLabel = useCronLabel();
  const automationsQuery = useAutomationsQuery();
  const trigger = useTriggerAutomationMutation();
  const [selected, setSelected] = useState<string | null>(null);
  const [log, setLog] = useState<RunLogLine[]>([]);
  // Captured once at mount — coarse (minute/hour) relative labels on a
  // short-lived screen, same posture as `SystemAutomationRow`'s own `now`.
  const [now] = useState(() => Date.now());

  const automations = useMemo(
    () => (automationsQuery.data ?? []).filter((a) => isDistillTarget(a.target.type)),
    [automationsQuery.data],
  );
  const current = automations.find((a) => a.id === selected) ?? automations[0];

  const runNow = (automation: Automation) => {
    trigger.mutate(
      { params: { id: automation.id }, body: {} },
      {
        onSuccess: ({ body }) => {
          setLog((prev) => [
            { automationId: automation.id, at: new Date().toISOString(), ref: body.runRef },
            ...prev,
          ]);
        },
      },
    );
  };

  if (automationsQuery.isPending) {
    return (
      <Container padding={["300", "350"]}>
        <PageContainer>
          <QueryLoading />
        </PageContainer>
      </Container>
    );
  }
  if (automationsQuery.isError) {
    return (
      <Container padding={["300", "350"]}>
        <PageContainer>
          <QueryError onRetry={() => void automationsQuery.refetch()} />
        </PageContainer>
      </Container>
    );
  }

  return (
    <Container padding={["300", "350"]}>
      <PageContainer stretch>
        <Stack gap="250">
          <Stack gap="50">
            <Typography type="title">{t("distill.title")}</Typography>
            <Typography size="sm" type="note" variant="secondary">
              {t("distill.subtitle")}
            </Typography>
          </Stack>

          {automations.length === 0 ? (
            <Panel header={t("distill.log")} padding="300">
              <Typography size="sm" type="note" variant="tertiary">
                {t("distill.noAutomations")}
              </Typography>
            </Panel>
          ) : (
            <Grid align="start" gap="200" sidebar="left">
              <List>
                {automations.map((a) => {
                  const runs = log.filter((l) => l.automationId === a.id);
                  return (
                    <ListItem
                      active={a.id === current?.id}
                      id={a.id}
                      key={a.id}
                      onSelect={() => setSelected(a.id)}
                    >
                      <ListItemText>
                        <Stack gap="25">
                          <Typography size="sm" type="note" weight="semibold">
                            {a.name ?? a.id}
                          </Typography>
                          <Typography mono size="2xs" type="note" variant="tertiary">
                            {a.trigger.type === "cron" ? cronLabel(a.trigger.expr) : a.trigger.type}
                            {" · "}
                            {runs.length}
                          </Typography>
                        </Stack>
                      </ListItemText>
                    </ListItem>
                  );
                })}
              </List>

              {current && (
                <Panel
                  header={current.name ?? current.id}
                  headerEnd={
                    <Button
                      data-testid="distill-run-now"
                      icon="play"
                      intent="primary"
                      loading={trigger.isPending}
                      onClick={() => runNow(current)}
                      size="sm"
                    >
                      {trigger.isPending ? t("distill.running") : t("distill.runNow")}
                    </Button>
                  }
                  padding="250"
                >
                  <Stack gap="200">
                    <Typography size="sm" type="note" variant="secondary">
                      {isDistillTarget(current.target.type)
                        ? ta(`automations.desc.${current.target.type}`)
                        : ""}
                    </Typography>
                    <Typography mono size="2xs" type="note" variant="tertiary">
                      {current.lastFiredAt
                        ? t("distill.lastRun", {
                            ago: relativeLabel(Date.parse(current.lastFiredAt), now, locale),
                          })
                        : t("distill.neverRun")}
                    </Typography>

                    <Typography mono size="2xs" type="note" variant="tertiary">
                      {t("distill.metricsUnavailable")}
                    </Typography>

                    <Typography
                      mono
                      uppercase
                      size="2xs"
                      tracking="wide"
                      type="note"
                      variant="tertiary"
                    >
                      {t("distill.log")}
                    </Typography>
                    <Stack gap="75">
                      {log
                        .filter((l) => l.automationId === current.id)
                        .map((l) => (
                          <Typography mono key={l.at} size="xs" type="note" variant="secondary">
                            {new Date(l.at).toLocaleTimeString()} —{" "}
                            {t("distill.outcome", { ref: l.ref })}
                          </Typography>
                        ))}
                    </Stack>
                  </Stack>
                </Panel>
              )}
            </Grid>
          )}

          <Stack gap="150">
            <Typography mono uppercase size="2xs" tracking="wide" type="note" variant="tertiary">
              {t("distill.selfModel.title")}
            </Typography>
            <SelfKnowledgeSection />
          </Stack>
        </Stack>
      </PageContainer>
    </Container>
  );
}
