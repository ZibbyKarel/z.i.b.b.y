"use client";

import type { Route } from "next";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Container,
  type IconName,
  Markdown,
  Panel,
  Stack,
  type SubNavLinkComponent,
  Typography,
} from "@zibby/design-system";
import { PageBreadcrumb } from "../../components/layout/PageBreadcrumb";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import type { Skill, SkillSource } from "@zibby/contracts";
import { useFormControls, zodResolver } from "@zibby/forms";
import { z } from "zod";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { toastBus } from "../../components/Toaster/toastBus";
import { ExternalSkillSource } from "./components/ExternalSkillSource";
import { SkillFormFields, type SkillFormValues } from "./components/SkillFormFields";
import { UninstallExternalSkillDialog } from "./components/UninstallExternalSkillDialog";
import {
  useDeleteSkillMutation,
  useSyncExternalSkillMutation,
  useUpdateSkillMutation,
} from "./mutations";
import { skillFile, useSkillCategoriesQuery, useSkillQuery } from "./queries";

export enum SkillDetailScreenTestId {
  Save = "skill-detail-save",
  Delete = "skill-detail-delete",
  Sync = "skill-detail-sync",
  Uninstall = "skill-detail-uninstall",
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
  const { source } = query.data;
  if (source) return <ExternalSkillView key={query.data.id} skill={query.data} source={source} />;
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
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <PageBreadcrumb
            items={[
              { label: tk("registries.title"), href: "/system/registries/skills" as Route },
              { label: name },
            ]}
            linkComponent={Link as SubNavLinkComponent}
          />

          <Stack wrap align="center" direction="row" gap="150" justify="between">
            <Typography type="h1">{name}</Typography>
            <Stack align="center" direction="row" gap="100">
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
            </Stack>
          </Stack>

          <Panel header={tf("editTitle")} padding="200">
            <SkillFormFields
              categories={categories.map((c) => c.name)}
              glyph={glyph}
              initialTab="editor"
              onGlyphChange={setGlyph}
              setInstructions={(v) =>
                form.setValue("instructions", v, { shouldDirty: true, shouldValidate: true })
              }
            />
          </Panel>
        </Stack>
      </PageContainer>

      {confirmDelete && (
        <ConfirmDeleteDialog
          body={t("deleteBody", { name, file: skillFile(skill.id) })}
          cancelLabel={tk("common.cancel")}
          confirmLabel={tk("common.delete")}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            deleteSkill.mutate(
              { params: { id: skill.id } },
              { onSuccess: () => router.push("/system/registries/skills") },
            )
          }
          pending={deleteSkill.isPending}
          title={t("deleteTitle")}
        />
      )}
    </Container>,
  );
}

/**
 * Read-only view of a skill installed from GitHub (PATCH/DELETE answer 409): its
 * provenance and body, with "check for updates" and "uninstall" top-right in
 * place of Save/Delete. Uninstall asks per using workflow in its own dialog.
 */
function ExternalSkillView({ skill, source }: { skill: Skill; source: SkillSource }) {
  const t = useTranslations("skills.external");
  const tk = useTranslations();
  const router = useRouter();
  const sync = useSyncExternalSkillMutation();
  const [uninstalling, setUninstalling] = useState(false);
  const name = skill.name ?? skill.id;

  const checkForUpdates = () =>
    sync.mutate(
      { params: { id: skill.id }, body: {} },
      {
        onSuccess: (res) =>
          toastBus.emit({
            severity: "ok",
            message: t(res.body.source?.sha !== source.sha ? "syncUpdated" : "syncCurrent"),
          }),
      },
    );

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <PageBreadcrumb
            items={[
              { label: tk("registries.title"), href: "/system/registries/skills" as Route },
              { label: name },
            ]}
            linkComponent={Link as SubNavLinkComponent}
          />

          <Stack wrap align="center" direction="row" gap="150" justify="between">
            <Typography type="h1">{name}</Typography>
            <Stack align="center" direction="row" gap="100">
              <Button
                data-testid={SkillDetailScreenTestId.Uninstall}
                icon="trash"
                intent="danger"
                onClick={() => setUninstalling(true)}
                size="sm"
              >
                {t("uninstall")}
              </Button>
              <Button
                data-testid={SkillDetailScreenTestId.Sync}
                icon="retry"
                intent="primary"
                loading={sync.isPending}
                onClick={checkForUpdates}
                size="sm"
              >
                {t("sync")}
              </Button>
            </Stack>
          </Stack>

          <Panel header={source.url} padding="200">
            <Stack gap="200">
              <ExternalSkillSource source={source} />
              <Typography size="sm" type="note" variant="secondary">
                {t("readOnly")}
              </Typography>
              {skill.desc && <Typography type="note">{skill.desc}</Typography>}
              <Markdown source={skill.instructions} />
            </Stack>
          </Panel>
        </Stack>
      </PageContainer>

      {uninstalling && (
        <UninstallExternalSkillDialog
          name={name}
          onClose={() => setUninstalling(false)}
          onUninstalled={() => router.push("/system/registries/skills")}
          skillId={skill.id}
        />
      )}
    </Container>
  );
}
