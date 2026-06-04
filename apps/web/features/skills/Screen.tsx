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
import { useSkillsQuery } from "./queries";
import { useCreateSkillMutation, useStartSkillRunMutation } from "./mutations";

/** Slugify a free-form name into a filename-safe skill id. */
const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "novy";

export function Screen() {
  const t = useTranslations();
  const { data } = useSkillsQuery();
  const skills = data ?? [];
  const createSkill = useCreateSkillMutation();
  const startRun = useStartSkillRunMutation();
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
            const id = slug(values.name ?? "");
            const desc = values.desc?.trim() || t("defaults.skill");
            createSkill.mutate(
              {
                body: {
                  id,
                  name: values.name?.trim() || id,
                  glyph: "spark",
                  desc,
                  // The form captures no body yet; seed instructions from the
                  // description so the SKILL.md has a non-empty body to start from.
                  instructions: desc,
                },
              },
              { onSuccess: () => setAdding(false) },
            );
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
          onLaunch={({ prompt, project }) =>
            startRun.mutate({ params: { id: runSkill.id }, body: { prompt, project } })
          }
          projects={[...PROJECTS]}
        />
      )}
    </PageContainer>
  );
}
