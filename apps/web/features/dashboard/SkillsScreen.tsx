"use client";

import { useState } from "react";
import {
  Button,
  EmptyState,
  EntityFormModal,
  RunModal,
  SectionLabel,
  type Skill,
} from "@zibby/design-system";
import { SkillTile } from "../skills/components/SkillTile";
import { PROJECTS } from "./config";
import { SKILL_FORM } from "./forms";
import { useDashboardStore } from "./store";
import { useDashboardContext } from "./dashboardContext";

export function SkillsScreen() {
  const { context } = useDashboardContext();
  const { skills, addSkill } = useDashboardStore();
  const [adding, setAdding] = useState(false);
  const [runSkill, setRunSkill] = useState<Skill | null>(null);

  const list = skills.filter((s) => s.ctx === context);

  return (
    <div className="mx-auto max-w-[1400px]">
      <SectionLabel
        action={
          <Button intent="run" icon="plus" size="sm" onClick={() => setAdding(true)}>
            Přidat skill
          </Button>
        }
      >
        Skilly · {context}
      </SectionLabel>

      {list.length === 0 ? (
        <EmptyState
          glyph="spark"
          title="Zatím žádné skilly"
          description="Skilly jsou soubory SKILL.md na disku. Přidej první a objeví se tu jako karta s čudlíkem Spustit."
          actionLabel="Přidat skill"
          onAction={() => setAdding(true)}
          hint="// vytvoří ~/zibby/skills/<název>/SKILL.md"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <SkillTile key={s.id} skill={s} onRun={setRunSkill} />
          ))}
        </div>
      )}

      {adding && (
        <EntityFormModal
          title={SKILL_FORM.title}
          subtitle={SKILL_FORM.subtitle}
          glyph={SKILL_FORM.glyph}
          fields={SKILL_FORM.fields}
          submitLabel={SKILL_FORM.submitLabel}
          filePreview={SKILL_FORM.filePreview}
          onClose={() => setAdding(false)}
          onSubmit={(values) => { addSkill(values); setAdding(false); }}
        />
      )}

      {runSkill && (
        <RunModal
          key={runSkill.id}
          skill={runSkill}
          projects={[...PROJECTS]}
          onClose={() => setRunSkill(null)}
        />
      )}
    </div>
  );
}
