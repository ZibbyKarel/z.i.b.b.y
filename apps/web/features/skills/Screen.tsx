"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Container, Grid } from "@zibby/design-system";
import { type Skill, skillToAgent } from "../../domain";
import { SectionLabel } from "../../components/SectionLabel";
import { EntityFormModal } from "../../components/EntityFormModal/EntityFormModal";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { SkillTile } from "./components/SkillTile";
import { RunModal } from "./components/RunModal/RunModal";
import { PROJECTS } from "../../state/config";
import { useEntityForm } from "../../state/forms";
import { useCatalog } from "../../state/store";

export function Screen() {
  const t = useTranslations();
  const { skills, addSkill } = useCatalog();
  const [adding, setAdding] = useState(false);
  const [runSkill, setRunSkill] = useState<Skill | null>(null);
  const form = useEntityForm("skill");

  const list = skills;

  return (
    <Container maxWidth="1400px" style={{ marginInline: "auto" }}>
      <SectionLabel
        action={
          <Button icon="plus" intent="run" onClick={() => setAdding(true)} size="sm">
            {t("skills.addSkill")}
          </Button>
        }
      >
        {t("skills.sectionLabel")}
      </SectionLabel>

      {list.length === 0 ? (
        <EmptyState
          actionLabel={t("skills.addSkill")}
          description={t("skills.emptyDescription")}
          glyph="spark"
          hint={t("skills.emptyHint")}
          onAction={() => setAdding(true)}
          title={t("skills.emptyTitle")}
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
          fields={form.fields}
          filePreview={form.filePreview}
          glyph={form.glyph}
          onClose={() => setAdding(false)}
          onSubmit={(values) => { addSkill(values, t("defaults.skill")); setAdding(false); }}
          submitLabel={form.submitLabel}
          subtitle={form.subtitle}
          title={form.title}
        />
      )}

      {runSkill && (
        <RunModal
          agent={skillToAgent(runSkill)}
          file={runSkill.file}
          key={runSkill.id}
          onClose={() => setRunSkill(null)}
          projects={[...PROJECTS]}
        />
      )}
    </Container>
  );
}
