"use client";

import { useState } from "react";
import { Button, Container, Grid } from "@zibby/design-system";
import type { Skill } from "../../domain";
import { SectionLabel } from "./components/SectionLabel";
import { EntityFormModal } from "./components/EntityFormModal";
import { EmptyState } from "./components/EmptyState";
import { SkillTile } from "../skills/components/SkillTile";
import { RunModal } from "../skills/components/RunModal";
import { PROJECTS } from "./config";
import { SKILL_FORM } from "./forms";
import { useDashboardStore } from "./store";
import { useGlobalStateContext } from "apps/web/global/contexts/GlobalStateContext";

export function SkillsScreen() {
  const { context } = useGlobalStateContext();
  const { skills, addSkill } = useDashboardStore();
  const [adding, setAdding] = useState(false);
  const [runSkill, setRunSkill] = useState<Skill | null>(null);

  const list = skills.filter((s) => s.ctx === context);

  return (
    <Container maxWidth="1400px" style={{ marginInline: "auto" }}>
      <SectionLabel
        action={
          <Button icon="plus" intent="run" onClick={() => setAdding(true)} size="sm">
            Přidat skill
          </Button>
        }
      >
        Skilly · {context}
      </SectionLabel>

      {list.length === 0 ? (
        <EmptyState
          actionLabel="Přidat skill"
          description="Skilly jsou soubory SKILL.md na disku. Přidej první a objeví se tu jako karta s čudlíkem Spustit."
          glyph="spark"
          hint="// vytvoří ~/zibby/skills/<název>/SKILL.md"
          onAction={() => setAdding(true)}
          title="Zatím žádné skilly"
        />
      ) : (
        <Grid cols={1} gap="150" lg={3} sm={2}>
          {list.map((s) => (
            <SkillTile key={s.id} onRun={setRunSkill} skill={s} />
          ))}
        </Grid>
      )}

      {adding && (
        <EntityFormModal
          fields={SKILL_FORM.fields}
          filePreview={SKILL_FORM.filePreview}
          glyph={SKILL_FORM.glyph}
          onClose={() => setAdding(false)}
          onSubmit={(values) => { addSkill(values); setAdding(false); }}
          submitLabel={SKILL_FORM.submitLabel}
          subtitle={SKILL_FORM.subtitle}
          title={SKILL_FORM.title}
        />
      )}

      {runSkill && (
        <RunModal
          key={runSkill.id}
          onClose={() => setRunSkill(null)}
          projects={[...PROJECTS]}
          skill={runSkill}
        />
      )}
    </Container>
  );
}
