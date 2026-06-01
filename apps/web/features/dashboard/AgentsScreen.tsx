"use client";

import { useState } from "react";
import { Button, Container, Grid } from "@zibby/design-system";
import { SectionLabel } from "./components/SectionLabel";
import { EntityFormModal } from "./components/EntityFormModal";
import { EmptyState } from "./components/EmptyState";
import { AgentCard } from "../agents/components/AgentCard";
import { AGENT_FORM } from "./forms";
import { useDashboardStore } from "./store";
import { useDashboardContext } from "./dashboardContext";

export function AgentsScreen() {
  const { context } = useDashboardContext();
  const { agents, addAgent } = useDashboardStore();
  const [adding, setAdding] = useState(false);

  const list = agents.filter((a) => a.ctx === context);

  return (
    <Container maxWidth="1400px" style={{ marginInline: "auto" }}>
      <SectionLabel
        action={
          <Button intent="run" icon="plus" size="sm" onClick={() => setAdding(true)}>
            Přidat agenta
          </Button>
        }
      >
        Agenti · {context}
      </SectionLabel>

      {list.length === 0 ? (
        <EmptyState
          glyph="bot"
          title="Zatím žádní agenti"
          description="Agenti jsou definiční soubory .agent.md — model, thinking level a nástroje. Z agentů pak skládáš pipeline v Orchestraci."
          actionLabel="Přidat agenta"
          onAction={() => setAdding(true)}
          hint="// vytvoří ~/zibby/agents/<název>.agent.md"
        />
      ) : (
        <Grid cols={1} sm={2} lg={3} gap="150">
          {list.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </Grid>
      )}

      {adding && (
        <EntityFormModal
          title={AGENT_FORM.title}
          subtitle={AGENT_FORM.subtitle}
          glyph={AGENT_FORM.glyph}
          fields={AGENT_FORM.fields}
          submitLabel={AGENT_FORM.submitLabel}
          filePreview={AGENT_FORM.filePreview}
          onClose={() => setAdding(false)}
          onSubmit={(values) => { addAgent(values); setAdding(false); }}
        />
      )}
    </Container>
  );
}
