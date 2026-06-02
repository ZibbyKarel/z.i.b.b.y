"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Container, Grid } from "@zibby/design-system";
import { SectionLabel } from "../../components/SectionLabel";
import { EntityFormModal } from "../../components/EntityFormModal/EntityFormModal";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { IntegrationCard } from "./components/IntegrationCard";
import { useEntityForm } from "../../state/forms";
import { useDashboardStore } from "../../state/store";

export function Screen() {
  const t = useTranslations();
  const { integrations, addIntegration } = useDashboardStore();
  const [adding, setAdding] = useState(false);
  const form = useEntityForm("integration");

  const list = integrations;

  return (
    <Container maxWidth="1400px" style={{ marginInline: "auto" }}>
      <SectionLabel
        action={
          <Button icon="plus" intent="run" onClick={() => setAdding(true)} size="sm">
            {t("integrations.addIntegration")}
          </Button>
        }
      >
        {t("integrations.sectionLabel")}
      </SectionLabel>

      {list.length === 0 ? (
        <EmptyState
          actionLabel={t("integrations.addIntegration")}
          description={t("integrations.emptyDescription")}
          glyph="plug"
          hint={t("integrations.emptyHint")}
          onAction={() => setAdding(true)}
          title={t("integrations.emptyTitle")}
        />
      ) : (
        <Grid cols={1} gap="150" lg={3} sm={2}>
          {list.map((i) => (
            <IntegrationCard integration={i} key={i.id} />
          ))}
        </Grid>
      )}

      {adding && (
        <EntityFormModal
          fields={form.fields}
          filePreview={form.filePreview}
          glyph={form.glyph}
          onClose={() => setAdding(false)}
          onSubmit={(values) => { addIntegration(values, t("defaults.integration")); setAdding(false); }}
          submitLabel={form.submitLabel}
          subtitle={form.subtitle}
          title={form.title}
        />
      )}
    </Container>
  );
}
