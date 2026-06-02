"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Container, Grid, Icon, Stack, Typography } from "@zibby/design-system";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { SectionLabel } from "../../components/SectionLabel";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { AgentCard } from "./components/AgentCard";
import { AgentDetailModal } from "./components/AgentDetailModal";
import { RunModal } from "../skills/components/RunModal/RunModal";
import { AGENT_CATEGORIES, AGENT_CATEGORY_GLYPH, PROJECTS } from "../../state/config";
import { newAgentDraft, slugifyAgent } from "./agentDraft";
import { useAgents, useCreateAgent, useDeleteAgent, useUpdateAgent } from "./queries";
import { useCatalog } from "../../state/store";
import type { AgentDef, Skill } from "../../domain";

export function Screen() {
  const ta = useTranslations("agents");
  const agents = useAgents();
  const { pipelines } = useCatalog();
  const { createAgent } = useCreateAgent();
  const { updateAgent, setEnabled } = useUpdateAgent();
  const { deleteAgent } = useDeleteAgent();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentDef | null>(null);
  const [runAgent, setRunAgent] = useState<AgentDef | null>(null);

  const list = agents;
  const activeCount = list.filter((a) => a.enabled !== false).length;
  const categories = AGENT_CATEGORIES;

  const pipelineCount = (a: AgentDef) =>
    pipelines.filter((p) => p.phases.some((ph) => ph.agent === a.name)).length;

  const openAgent = openId ? (agents.find((a) => a.id === openId) ?? null) : null;

  const save = (d: AgentDef, isNew: boolean) => {
    if (isNew) {
      const id = slugifyAgent(d.name) || `agent-${Date.now()}`;
      createAgent({ ...d, id }, { onSuccess: setOpenId });
      setDraft(null);
    } else {
      updateAgent(d);
    }
  };

  const toSkill = (a: AgentDef): Skill => ({
    id: a.id,
    name: a.name,
    glyph: a.glyph,
    desc: a.role,
    file: a.file,
  });

  return (
    <Container maxWidth="1400px" style={{ marginInline: "auto" }}>
      <Stack gap="250">
        <HudPanel padding="300">
          <Stack wrap align="start" direction="row" gap="200" justify="between">
            <Container minW0>
              <Stack gap="75">
                <Typography leading="tight" tracking="tighter" type="pageTitle" weight="semibold">
                  {ta("title")}
                </Typography>
                <Typography mono size="sm" type="note" variant="tertiary">
                  {ta("countSummary", { count: list.length, active: activeCount })}
                </Typography>
              </Stack>
            </Container>
            <Button icon="plus" intent="run" onClick={() => setDraft(newAgentDraft())}>
              {ta("addAgent")}
            </Button>
          </Stack>
        </HudPanel>

        {list.length === 0 ? (
          <EmptyState
            actionLabel={ta("addAgent")}
            description={ta("emptyDescription")}
            glyph="bot"
            hint={ta("emptyHint")}
            onAction={() => setDraft(newAgentDraft())}
            title={ta("emptyTitle")}
          />
        ) : (
          categories.map((cat) => {
            const items = list.filter((a) => (a.category ?? categories[0]) === cat);
            if (items.length === 0) return null;
            return (
              <Container key={cat}>
                <SectionLabel
                  action={
                    <Typography mono size="xs" type="note" variant="tertiary">
                      {items.length}
                    </Typography>
                  }
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                    <Icon name={AGENT_CATEGORY_GLYPH[cat] ?? "bot"} size="sm" tone="accent" />{" "}
                    {ta(`categories.${cat}`)}
                  </span>
                </SectionLabel>
                <Grid cols={1} gap="150" lg={3} sm={2}>
                  {items.map((a) => (
                    <AgentCard
                      agent={a}
                      key={a.id}
                      onOpen={(x) => setOpenId(x.id)}
                      onRun={(x) => setRunAgent(x)}
                      onToggleEnabled={(x) => setEnabled(x.id, x.enabled === false)}
                      pipelineCount={pipelineCount(a)}
                    />
                  ))}
                </Grid>
              </Container>
            );
          })
        )}
      </Stack>

      {openAgent && (
        <AgentDetailModal
          agent={openAgent}
          key={openAgent.id}
          mode="view"
          onClose={() => setOpenId(null)}
          onDelete={(id) => {
            deleteAgent(id, { onSuccess: () => setOpenId(null) });
          }}
          onRun={(a) => {
            setRunAgent(a);
            setOpenId(null);
          }}
          onSave={save}
          onToggleEnabled={(a) => setEnabled(a.id, a.enabled === false)}
          pipelines={pipelines}
        />
      )}

      {draft && (
        <AgentDetailModal
          agent={draft}
          key="new-agent"
          mode="new"
          onClose={() => setDraft(null)}
          onDelete={() => setDraft(null)}
          onRun={() => {}}
          onSave={save}
          onToggleEnabled={() => {}}
          pipelines={pipelines}
        />
      )}

      {runAgent && (
        <RunModal
          key={runAgent.id}
          onClose={() => setRunAgent(null)}
          projects={[...PROJECTS]}
          skill={toSkill(runAgent)}
        />
      )}
    </Container>
  );
}
