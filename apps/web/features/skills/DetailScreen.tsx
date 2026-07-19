"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Container, type IconName, Stack } from "@zibby/design-system";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import type { Skill } from "@zibby/contracts";
import { useFormControls, zodResolver } from "@zibby/forms";
import { z } from "zod";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { ImmersivePage } from "../../components/layout/ImmersivePage/ImmersivePage";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { SkillFormFields, type SkillFormValues } from "./components/SkillFormFields";
import { useDeleteSkillMutation, useUpdateSkillMutation } from "./mutations";
import { skillFile, useSkillCategoriesQuery, useSkillQuery } from "./queries";

export enum SkillDetailScreenTestId {
  Save = "skill-detail-save",
  Delete = "skill-detail-delete",
}

const schema = z.object({
  name: z.string().min(1),
  desc: z.string(),
  category: z.string(),
  instructions: z.string(),
});

export interface SkillDetailScreenProps {
  skillId: string;
}

/**
 * The `/skills/:id` detail page (N4d, on the N4c agents template) — the
 * grammar-conformant replacement for the modal's edit mode: a tile click
 * NAVIGATES here, the page IS the edit surface (the same
 * {@link SkillFormFields} body the create dialog renders) and Save/Delete sit
 * top-right; delete asks in a confirm dialog (it used to fire unconfirmed).
 */
export function DetailScreen({ skillId }: SkillDetailScreenProps) {
  const query = useSkillQuery(skillId);
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;
  if (query.isPending) return <QueryLoading />;
  if (!query.data) return null;
  // The form captures its defaults at mount — key by skill so a different id remounts.
  return <SkillEditor key={query.data.id} skill={query.data} />;
}

function SkillEditor({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const tf = useTranslations("forms.skill");
  const tk = useTranslations();
  const router = useRouter();
  const { data: categories = [] } = useSkillCategoriesQuery();
  const updateSkill = useUpdateSkillMutation();
  const deleteSkill = useDeleteSkillMutation();

  const [glyph, setGlyph] = useState<IconName>((skill.glyph as IconName | undefined) ?? "spark");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const name = skill.name ?? skill.id;

  const { renderForm, submit, form } = useFormControls<SkillFormValues>({
    defaultValues: {
      name: skill.name ?? skill.id,
      desc: skill.desc ?? "",
      category: skill.category ?? "",
      instructions: skill.instructions,
    },
    resolver: zodResolver(schema),
    mode: "onChange",
    onSubmit: (values) => {
      // Description and body both fall back so the SKILL.md is never empty.
      const safeDesc = values.desc.trim() || tk("defaults.skill");
      updateSkill.mutate({
        params: { id: skill.id },
        body: {
          name: values.name.trim() || skill.id,
          glyph,
          desc: safeDesc,
          category: values.category.trim() || undefined,
          instructions: values.instructions.trim() || safeDesc,
        },
      });
    },
  });

  const canSave = form.formState.isValid && !updateSkill.isPending;

  return renderForm(
    <ImmersivePage
      actions={
        <>
          <Button
            data-testid={SkillDetailScreenTestId.Delete}
            icon="trash"
            intent="danger"
            onClick={() => setConfirmDelete(true)}
            size="sm"
          >
            {tk("common.delete")}
          </Button>
          <Button
            data-testid={SkillDetailScreenTestId.Save}
            disabled={!canSave}
            icon="check"
            intent="primary"
            loading={updateSkill.isPending}
            onClick={() => void submit()}
            size="sm"
          >
            {tk("common.save")}
          </Button>
        </>
      }
      backHref="/skills"
      subtitle={skillFile(skill.id)}
      title={name}
    >
      <Container padding={["300", "350"]}>
        <PageContainer>
          <Stack gap="250">
            <HudPanel surface="glass" title={tf("editTitle")}>
              <SkillFormFields
                categories={categories.map((c) => c.name)}
                glyph={glyph}
                initialTab="editor"
                onGlyphChange={setGlyph}
                setInstructions={(v) =>
                  form.setValue("instructions", v, { shouldDirty: true, shouldValidate: true })
                }
              />
            </HudPanel>
          </Stack>
        </PageContainer>
      </Container>

      {confirmDelete && (
        <ConfirmDeleteDialog
          body={t("deleteBody", { name, file: skillFile(skill.id) })}
          cancelLabel={tk("common.cancel")}
          confirmLabel={tk("common.delete")}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            deleteSkill.mutate(
              { params: { id: skill.id } },
              { onSuccess: () => router.push("/skills") },
            )
          }
          pending={deleteSkill.isPending}
          title={t("deleteTitle")}
        />
      )}
    </ImmersivePage>,
  );
}
