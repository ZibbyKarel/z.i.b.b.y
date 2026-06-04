"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Container, Stack, Stat } from "@zibby/design-system";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { SectionLabel } from "../../components/SectionLabel/SectionLabel";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { useApprovalsQuery } from "./queries";
import { useApproveMutation, useRejectMutation } from "./mutations";
import { type RiskType, riskMeta } from "./approval";
import { ApprovalQueueCard } from "./components/ApprovalQueueCard";
import { type ApprovalDecision, ApprovalDetail } from "./components/ApprovalDetail";

const RISK_ORDER: RiskType[] = ["platba", "mazani", "push", "odeslani"];

export function Screen() {
  const t = useTranslations("approvals");
  const { data: queue = [] } = useApprovalsQuery();
  const approve = useApproveMutation();
  const reject = useRejectMutation();

  const [decided, setDecided] = useState<Record<string, ApprovalDecision>>({});
  const [selId, setSelId] = useState<string | null>(null);

  const selected = queue.find((a) => a.id === selId) ?? queue[0] ?? null;
  const pendingCount = queue.length;

  const decide = (id: string, kind: Exclude<ApprovalDecision, null>) => {
    setDecided((prev) => ({ ...prev, [id]: kind }));
    const mutation = kind === "approved" ? approve : reject;
    mutation.mutate({ params: { id }, body: {} });
    const next = queue.find((a) => a.id !== id && !decided[a.id]);
    if (next) setSelId(next.id);
  };

  const tallies = RISK_ORDER.map((rk) => ({
    rk,
    count: queue.filter((a) => a.riskType === rk).length,
  })).filter((x) => x.count > 0);

  return (
    <PageContainer>
      <Stack gap="250">
        <PageHeader
          actions={
            tallies.length > 0 ? (
              <Stack wrap align="center" direction="row" gap="200">
                {tallies.map(({ rk, count }) => {
                  const meta = riskMeta(rk);
                  return (
                    <Stat
                      icon={meta.glyph}
                      key={rk}
                      label={t(`risk.${rk}`)}
                      tone={meta.uiTone}
                      value={count}
                    />
                  );
                })}
              </Stack>
            ) : undefined
          }
          subtitle={pendingCount > 0 ? t("subtitlePending", { count: pendingCount }) : t("subtitleEmpty")}
          title={t("title")}
        />

        {pendingCount === 0 ? (
          <EmptyState
            description={t("emptyDesc")}
            glyph="shield"
            title={t("emptyTitle")}
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "340px minmax(0, 1fr)",
              gap: "1.25rem",
              alignItems: "start",
            }}
          >
            <Stack gap="100">
              <SectionLabel>{t("queueTitle")}</SectionLabel>
              {queue.map((a) => (
                <ApprovalQueueCard
                  actorKindLabel={t(`actorKind.${a.actorKind ?? a.kind}`)}
                  approval={a}
                  key={a.id}
                  onSelect={setSelId}
                  riskLabel={a.riskType ? t(`risk.${a.riskType}`) : ""}
                  selected={selected?.id === a.id}
                />
              ))}
            </Stack>

            {selected ? (
              <ApprovalDetail
                approval={selected}
                decision={decided[selected.id] ?? null}
                key={selected.id}
                onApprove={() => decide(selected.id, "approved")}
                onReject={() => decide(selected.id, "rejected")}
                onReset={() => setDecided((prev) => ({ ...prev, [selected.id]: null }))}
                pending={approve.isPending || reject.isPending}
              />
            ) : (
              <HudPanel padding="500">
                <Container textAlign="center">
                  <Stack align="center" gap="100">
                    <SectionLabel>{t("emptyTitle")}</SectionLabel>
                  </Stack>
                </Container>
              </HudPanel>
            )}
          </div>
        )}
      </Stack>
    </PageContainer>
  );
}
