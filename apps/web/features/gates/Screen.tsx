"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { GateRule, GateRuleInput } from "@zibby/contracts";
import { Alert, Button, Container, Icon, SelectField, Stack, Typography } from "@zibby/design-system";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { SectionLabel } from "../../components/SectionLabel/SectionLabel";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { useAgentsQuery } from "../agents/queries";
import { useAgentGatesQuery, useSystemPolicyQuery } from "./queries";
import { useReplaceAgentGatesMutation } from "./mutations/useReplaceAgentGatesMutation";
import { RuleCard } from "./components/RuleCard";
import { RuleModal } from "./components/RuleModal";

const toInput = (r: GateRule): GateRuleInput => ({ match: r.match, decision: r.decision, resolve: r.resolve });

export function Screen() {
  const t = useTranslations("gates");
  const { data: agents = [] } = useAgentsQuery();
  const { data: policy = [] } = useSystemPolicyQuery();

  const [agentId, setAgentId] = useState<string | null>(null);
  const effectiveId = agentId ?? agents[0]?.id ?? null;
  const { data: gates } = useAgentGatesQuery(effectiveId);
  const replace = useReplaceAgentGatesMutation(effectiveId ?? "");
  const [adding, setAdding] = useState(false);

  const own = gates?.own ?? [];
  const inherited = gates?.inherited ?? policy;

  const commit = (rules: GateRuleInput[]) => {
    if (!effectiveId) return;
    replace.mutate({ params: { id: effectiveId }, body: { gates: rules } });
  };
  const addRule = (rule: GateRuleInput) => {
    commit([...own.map(toInput), rule]);
    setAdding(false);
  };
  const deleteRule = (id: string) => commit(own.filter((r) => r.id !== id).map(toInput));

  const ruleLabels = (r: GateRule) => ({
    decisionLabel: t(`decision_.${r.decision}`),
    andLabel: "AND",
    youLabel: t("you"),
    notifyHint: t("notifyHint"),
  });

  return (
    <PageContainer maxWidth="980px">
      <Stack gap="250">
        <PageHeader subtitle={t("subtitle")} title={t("title")} />

        {agents.length === 0 ? (
          <EmptyState description={t("emptyDesc")} glyph="shield" title={t("emptyTitle")} />
        ) : (
          <>
            <HudPanel padding="250">
              <Stack align="center" direction="row" gap="150">
                <Container minW0 maxWidth="320px">
                  <SelectField
                    label={t("forAgent")}
                    onValueChange={setAgentId}
                    options={agents.map((a) => ({ value: a.id, label: a.name ?? a.id }))}
                    value={effectiveId ?? ""}
                  />
                </Container>
                <Container grow>
                  <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
                    {t("evalNote")}
                  </Typography>
                </Container>
              </Stack>
            </HudPanel>

            {/* inherited (locked) system floor */}
            <HudPanel padding="250" title={t("inheritedTitle")} tone="warn">
              <Stack gap="100">
                <Stack align="center" direction="row" gap="100">
                  <Icon name="link" size="xs" tone="faint" />
                  <Typography mono size="2xs" type="note" variant="tertiary">
                    {t("inheritedNote")}
                  </Typography>
                </Stack>
                {inherited.map((r) => (
                  <RuleCard locked key={r.id} rule={r} {...ruleLabels(r)} />
                ))}
              </Stack>
            </HudPanel>

            {/* agent's own (editable) rules */}
            <HudPanel padding="250">
              <Stack gap="150">
                <SectionLabel
                  action={
                    <Button icon="plus" intent="run" onClick={() => setAdding(true)} size="sm">
                      {t("addRule")}
                    </Button>
                  }
                >
                  {t("ownTitle", { agent: agents.find((a) => a.id === effectiveId)?.name ?? effectiveId ?? "" })}
                </SectionLabel>

                {replace.isError && <Alert severity="error">{t("violation")}</Alert>}

                {own.length === 0 ? (
                  <Typography mono size="sm" type="note" variant="tertiary">
                    {t("noOwnRules")}
                  </Typography>
                ) : (
                  <Stack gap="100">
                    {own.map((r) => (
                      <RuleCard key={r.id} onDelete={deleteRule} rule={r} {...ruleLabels(r)} />
                    ))}
                  </Stack>
                )}
              </Stack>
            </HudPanel>
          </>
        )}
      </Stack>

      {adding && <RuleModal onClose={() => setAdding(false)} onSave={addRule} />}
    </PageContainer>
  );
}
