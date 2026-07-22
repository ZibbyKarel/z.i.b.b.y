"use client";

import type { HandoffSignalKind } from "@zibby/contracts";
import { Container, Stack, Typography } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { ImmersivePage } from "../../../components/layout/ImmersivePage/ImmersivePage";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { useSignalKindsQuery } from "../../handoff/queries";
import { signalKindDescription, signalKindLabel } from "../../handoff/signalKinds";
import { useSubsystemsQuery } from "../../subsystems/queries";
import { SignalStatusBadge } from "./SignalStatusBadge";

export enum SignalDetailScreenTestId {
  NotFound = "signal-detail-not-found",
  BuildTaskLink = "signal-detail-build-task-link",
  SystemNote = "signal-detail-system-note",
}

export interface SignalDetailScreenProps {
  signalId: string;
}

/**
 * `/signals/[id]` — read-only detail for one registry entry (B3a design doc).
 * Resolves `signalId` by client-side `find` over the same `useSignalKindsQuery()`
 * list the `/signals` screen already reads (no dedicated `GET /:id` endpoint —
 * the registry is small and always fetched whole). NO edit/delete controls —
 * that's B3b; this page only reads.
 */
export function SignalDetailScreen({ signalId }: SignalDetailScreenProps) {
  const query = useSignalKindsQuery();
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;
  if (query.isPending) return <QueryLoading />;

  const kind = (query.data ?? []).find((sk) => sk.id === signalId);
  if (!kind) return <SignalNotFound />;

  return <SignalDetail kind={kind} />;
}

function SignalNotFound() {
  const t = useTranslations("signals");
  return (
    <ImmersivePage backHref="/signals" title={t("detail.notFoundTitle")}>
      <Container padding={["300", "350"]}>
        <PageContainer>
          <div data-testid={SignalDetailScreenTestId.NotFound}>
            <EmptyState
              description={t("detail.notFoundDescription")}
              glyph="search"
              title={t("detail.notFoundTitle")}
            />
          </div>
        </PageContainer>
      </Container>
    </ImmersivePage>
  );
}

/** Label/value row for the read-only field panel — mirrors the small labelled
 * chips `ArtefaktyTab`/`HandoffRuleRow` already use for this kind of display. */
function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack wrap align="center" direction="row" gap="150" justify="between">
      <Typography size="sm" type="note" variant="secondary">
        {label}
      </Typography>
      {value}
    </Stack>
  );
}

function SignalDetail({ kind }: { kind: HandoffSignalKind }) {
  const t = useTranslations("signals");
  const th = useTranslations("subsystems.handoff");
  const { data: subsystems = [] } = useSubsystemsQuery();

  const label = signalKindLabel(kind, th);
  const producerName = subsystems.find((s) => s.id === kind.from)?.name ?? kind.from;

  return (
    <ImmersivePage backHref="/signals" subtitle={kind.id} title={label}>
      <Container padding={["300", "350"]}>
        <PageContainer>
          <Stack gap="250">
            <HudPanel surface="glass" title={t("detail.panelTitle")}>
              <Stack gap="150">
                <FieldRow
                  label={t("detail.slug")}
                  value={
                    <Typography mono size="sm" type="text">
                      {kind.id}
                    </Typography>
                  }
                />
                <FieldRow
                  label={t("detail.producer")}
                  value={
                    <Typography size="sm" type="text">
                      {producerName}
                    </Typography>
                  }
                />
                <FieldRow
                  label={t("detail.status")}
                  value={<SignalStatusBadge status={kind.status} />}
                />
                <FieldRow
                  label={t("detail.severityBearing")}
                  value={
                    <Typography size="sm" type="text">
                      {kind.severityBearing ? t("yes") : t("no")}
                    </Typography>
                  }
                />
                {kind.system && (
                  <div data-testid={SignalDetailScreenTestId.SystemNote}>
                    <Typography mono size="2xs" type="note" variant="tertiary">
                      {t("detail.systemNote")}
                    </Typography>
                  </div>
                )}
              </Stack>
            </HudPanel>

            <HudPanel surface="glass" title={t("detail.descriptionTitle")}>
              <Typography leading="relaxed" size="sm" type="text" variant="secondary">
                {signalKindDescription(kind, th)}
              </Typography>
            </HudPanel>

            {kind.buildTaskId && (
              <HudPanel surface="glass" title={t("detail.buildTaskTitle")}>
                {/* Typed routes can't infer this template — same `as Route` idiom
                    `ArtefaktyTab`'s run link uses. `/archiv` accepts a task id
                    through `?run=` just as it does a run ref (see
                    `useTaskSubmit.ts`), and `buildTaskId` is a task id. */}
                <Link
                  data-testid={SignalDetailScreenTestId.BuildTaskLink}
                  href={`/archiv?run=${kind.buildTaskId}` as Route}
                >
                  <Typography mono size="sm" tone="accent" type="note">
                    {t("detail.buildTaskLink")}
                  </Typography>
                </Link>
              </HudPanel>
            )}
          </Stack>
        </PageContainer>
      </Container>
    </ImmersivePage>
  );
}
