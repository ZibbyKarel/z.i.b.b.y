"use client";

import { useState } from "react";
import { Button } from "@zibby/design-system";
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
    <div className="mx-auto max-w-[1400px]">
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((i) => (
            <IntegrationCard key={i.id} integration={i} />
          ))}
        </div>
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
    </div>
  );
}
