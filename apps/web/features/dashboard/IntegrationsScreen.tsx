"use client";

import { useState } from "react";
import { Button, Container, Grid } from "@zibby/design-system";
import { SectionLabel } from "./components/SectionLabel";
import { EntityFormModal } from "./components/EntityFormModal";
import { EmptyState } from "./components/EmptyState";
import { IntegrationCard } from "../integrations/components/IntegrationCard";
import { INTEGRATION_FORM } from "./forms";
import { useDashboardStore } from "./store";
import { useGlobalStateContext } from "apps/web/global/contexts/GlobalStateContext";

export function IntegrationsScreen() {
  const { context } = useGlobalStateContext();
  const { integrations, addIntegration } = useDashboardStore();
  const [adding, setAdding] = useState(false);

  const list = integrations.filter((i) => i.ctx === context);

  return (
    <Container maxWidth="1400px" style={{ marginInline: "auto" }}>
      <SectionLabel
        action={
          <Button icon="plus" intent="run" onClick={() => setAdding(true)} size="sm">
            Přidat integraci
          </Button>
        }
      >
        Integrace · {context}
      </SectionLabel>

      {list.length === 0 ? (
        <EmptyState
          actionLabel="Přidat integraci"
          description="Integrace jsou drivery, kterými systém osahá okolní svět. Secrets žijí v .env — tady je jen konfigurace."
          glyph="plug"
          hint="// vytvoří ~/zibby/integrations/<název>.json"
          onAction={() => setAdding(true)}
          title="Zatím žádné integrace"
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
          fields={INTEGRATION_FORM.fields}
          filePreview={INTEGRATION_FORM.filePreview}
          glyph={INTEGRATION_FORM.glyph}
          onClose={() => setAdding(false)}
          onSubmit={(values) => { addIntegration(values); setAdding(false); }}
          submitLabel={INTEGRATION_FORM.submitLabel}
          subtitle={INTEGRATION_FORM.subtitle}
          title={INTEGRATION_FORM.title}
        />
      )}
    </Container>
  );
}
