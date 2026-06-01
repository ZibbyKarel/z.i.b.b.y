"use client";

import { useState } from "react";
import { Button, Container, Grid } from "@zibby/design-system";
import { SectionLabel } from "./components/SectionLabel";
import { EntityFormModal } from "./components/EntityFormModal";
import { EmptyState } from "./components/EmptyState";
import { IntegrationCard } from "../integrations/components/IntegrationCard";
import { INTEGRATION_FORM } from "./forms";
import { useDashboardStore } from "./store";
import { useDashboardContext } from "./dashboardContext";

export function IntegrationsScreen() {
  const { context } = useDashboardContext();
  const { integrations, addIntegration } = useDashboardStore();
  const [adding, setAdding] = useState(false);

  const list = integrations.filter((i) => i.ctx === context);

  return (
    <Container maxWidth="1400px" style={{ marginInline: "auto" }}>
      <SectionLabel
        action={
          <Button intent="run" icon="plus" size="sm" onClick={() => setAdding(true)}>
            Přidat integraci
          </Button>
        }
      >
        Integrace · {context}
      </SectionLabel>

      {list.length === 0 ? (
        <EmptyState
          glyph="plug"
          title="Zatím žádné integrace"
          description="Integrace jsou drivery, kterými systém osahá okolní svět. Secrets žijí v .env — tady je jen konfigurace."
          actionLabel="Přidat integraci"
          onAction={() => setAdding(true)}
          hint="// vytvoří ~/zibby/integrations/<název>.json"
        />
      ) : (
        <Grid cols={1} sm={2} lg={3} gap="150">
          {list.map((i) => (
            <IntegrationCard key={i.id} integration={i} />
          ))}
        </Grid>
      )}

      {adding && (
        <EntityFormModal
          title={INTEGRATION_FORM.title}
          subtitle={INTEGRATION_FORM.subtitle}
          glyph={INTEGRATION_FORM.glyph}
          fields={INTEGRATION_FORM.fields}
          submitLabel={INTEGRATION_FORM.submitLabel}
          filePreview={INTEGRATION_FORM.filePreview}
          onClose={() => setAdding(false)}
          onSubmit={(values) => { addIntegration(values); setAdding(false); }}
        />
      )}
    </Container>
  );
}
