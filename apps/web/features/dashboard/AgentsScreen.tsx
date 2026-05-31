"use client";

import { useState } from "react";
import {
  AgentCard,
  Button,
  EmptyState,
  EntityFormModal,
  SectionLabel,
  type ContextName,
} from "@zibby/design-system";
import { AGENT_FORM } from "./forms";
import { useDashboardStore } from "./store";

export interface AgentsScreenProps {
  context: ContextName;
}

/** Agenti: registry of agent definition files + "Přidat agenta". */
export function AgentsScreen({ context }: AgentsScreenProps) {
  const { agents, addAgent } = useDashboardStore();
  const [adding, setAdding] = useState(false);

  const list = agents.filter((a) => a.ctx === context);

  return (
    <div className="mx-auto max-w-[1400px]">
      <SectionLabel
        action={
          <Button
            intent="run"
            icon="plus"
            size="sm"
            onClick={() => setAdding(true)}
          >
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
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
          onSubmit={(values) => {
            addAgent(values);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
