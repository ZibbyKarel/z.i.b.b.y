"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { type Skill, skillToAgent } from "../../domain";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { SectionToolbar } from "../../components/SectionToolbar/SectionToolbar";
import { Collection } from "../../components/Collection/Collection";
import { EntityFormModal } from "../../components/EntityFormModal/EntityFormModal";
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

  return (
    <PageContainer>
      <SectionToolbar
        addLabel={t("skills.addSkill")}
        label={t("skills.sectionLabel")}
        onAdd={() => setAdding(true)}
      />

      <Collection
        empty={{
          glyph: "spark",
          title: t("skills.emptyTitle"),
          description: t("skills.emptyDescription"),
          actionLabel: t("skills.addSkill"),
          hint: t("skills.emptyHint"),
          onAction: () => setAdding(true),
        }}
        items={skills}
        renderItem={(s) => <SkillTile key={s.id} onRun={setRunSkill} skill={s} />}
      />

      {adding && (
        <EntityFormModal
          fields={form.fields}
          filePreview={form.filePreview}
          glyph={form.glyph}
          onClose={() => setAdding(false)}
          onSubmit={(values) => {
            addSkill(values, t("defaults.skill"));
            setAdding(false);
          }}
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
    </PageContainer>
  );
}
