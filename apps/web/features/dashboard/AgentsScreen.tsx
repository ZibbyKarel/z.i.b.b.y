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
          <Button icon="plus" intent="run" onClick={() => setAdding(true)} size="sm">
            Přidat agenta
          </Button>
        }
      >
        Agenti · {context}
      </SectionLabel>

      {list.length === 0 ? (
        <EmptyState
          actionLabel="Přidat agenta"
          description="Agenti jsou definiční soubory .agent.md — model, thinking level a nástroje. Z agentů pak skládáš pipeline v Orchestraci."
          glyph="bot"
          hint="// vytvoří ~/zibby/agents/<název>.agent.md"
          onAction={() => setAdding(true)}
          title="Zatím žádní agenti"
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
          fields={AGENT_FORM.fields}
          filePreview={AGENT_FORM.filePreview}
          glyph={AGENT_FORM.glyph}
          onClose={() => setAdding(false)}
          onSubmit={(values) => { addAgent(values); setAdding(false); }}
          submitLabel={AGENT_FORM.submitLabel}
          subtitle={AGENT_FORM.subtitle}
          title={AGENT_FORM.title}
        />
      )}
    </Container>
  );
}
