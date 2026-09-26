"use client";

import { Button, Container, Grid, Panel, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { useSignalKindsQuery } from "../../handoff/queries";
import { signalKindLabel } from "../../handoff/signalKinds";
import { useDepartmentsQuery } from "../../departments/queries";
import { SignalKindCard } from "./SignalKindCard";

/**
 * `/signals` — the handoff signal-kind registry, BROWSE half only (B3a design
 * doc, `docs/superpowers/specs/2026-07-22-handoff-signal-registry-and-receiver-filter-design.md`
 * §"Slot B → B3"). Kinds are grouped by producer department, one `Panel`
 * section per producer that owns ≥1 kind (mirrors `ArtefaktyTab`'s per-section
 * `Panel` grouping). "Nový signál" NAVIGATES to `/signals/new` — that route,
 * plus edit/delete, is a separate later slice (B3b); this screen only reads.
 */
export function SignalsScreen() {
  const t = useTranslations("signals");
  const th = useTranslations("departments.handoff");
  const router = useRouter();

  const signalKindsQuery = useSignalKindsQuery();
  const signalKinds = signalKindsQuery.data ?? [];
  // Department list drives group order + producer display names; not gated on
  // its own pending state (HandoffRulesSection takes the same posture — a
  // slowly-changing catalog usually already warm in cache).
  const { data: departments = [] } = useDepartmentsQuery();

  const goToNew = () => router.push("/signals/new");

  const groups = departments
    .map((department) => ({
      department,
      kinds: signalKinds.filter((kind) => kind.from === department.id),
    }))
    .filter((group) => group.kinds.length > 0);

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <Stack wrap align="center" direction="row" gap="150" justify="between">
            <Stack gap="25">
              <Typography type="h1">{t("title")}</Typography>
              <Typography mono size="xs" type="note" variant="tertiary">
                {t("countSummary", { count: signalKinds.length })}
              </Typography>
            </Stack>
            <Button icon="plus" intent="primary" onClick={goToNew}>
              {t("newSignal")}
            </Button>
          </Stack>

          {signalKindsQuery.isPending ? (
            <QueryLoading />
          ) : signalKindsQuery.isError ? (
            <QueryError onRetry={() => void signalKindsQuery.refetch()} />
          ) : groups.length === 0 ? (
            <EmptyState
              actionLabel={t("newSignal")}
              description={t("emptyDescription")}
              glyph="pulse"
              onAction={goToNew}
              title={t("emptyTitle")}
            />
          ) : (
            groups.map(({ department, kinds }) => (
              <Panel header={department.name} key={department.id} padding="200">
                <Grid cols={1} gap="150" lg={3} sm={2}>
                  {kinds.map((kind) => (
                    <SignalKindCard
                      key={kind.id}
                      kind={kind}
                      onSelect={() => router.push(`/signals/${kind.id}`)}
                      selectLabel={t("openSignalAria", {
                        label: signalKindLabel(kind, th),
                      })}
                    />
                  ))}
                </Grid>
              </Panel>
            ))
          )}
        </Stack>
      </PageContainer>
    </Container>
  );
}
