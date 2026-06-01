"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Container, Grid } from "@zibby/design-system";
import { SectionLabel } from "../../components/SectionLabel";
import { EntityFormModal } from "../../components/EntityFormModal/EntityFormModal";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { AgentCard } from "./components/AgentCard";
import { useEntityForm } from "../../state/forms";
import { useDashboardStore } from "../../state/store";
import { useGlobalStateContext } from "apps/web/global/contexts/GlobalStateContext";

export function Screen() {
  const t = useTranslations();
  const { context } = useGlobalStateContext();
  const { agents, addAgent } = useDashboardStore();
  const [adding, setAdding] = useState(false);
  const form = useEntityForm("agent");

  const list = agents.filter((a) => a.ctx === context);

  return (
    <Container maxWidth="1400px" style={{ marginInline: "auto" }}>
      <SectionLabel
        action={
          <Button icon="plus" intent="run" onClick={() => setAdding(true)} size="sm">
            {t("agents.addAgent")}
          </Button>
        }
      >
        {t("agents.sectionLabel", { ctx: context })}
      </SectionLabel>

      {list.length === 0 ? (
        <EmptyState
          actionLabel={t("agents.addAgent")}
          description={t("agents.emptyDescription")}
          glyph="bot"
          hint={t("agents.emptyHint")}
          onAction={() => setAdding(true)}
          title={t("agents.emptyTitle")}
        />
      ) : (
        <Grid cols={1} gap="150" lg={3} sm={2}>
          {list.map((a) => (
            <AgentCard agent={a} key={a.id} />
          ))}
        </Grid>
      )}

      {adding && (
        <EntityFormModal
          fields={form.fields}
          filePreview={form.filePreview}
          glyph={form.glyph}
          onClose={() => setAdding(false)}
          onSubmit={(values) => { addAgent(values, t("defaults.agent")); setAdding(false); }}
          submitLabel={form.submitLabel}
          subtitle={form.subtitle}
          title={form.title}
        />
      )}
    </Container>
  );
}
