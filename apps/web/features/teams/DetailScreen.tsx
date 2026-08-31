"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Container, DropDownButton, Pressable, Stack, Tag, Typography } from "@zibby/design-system";
import type { KnowledgeBaseSource } from "@zibby/contracts";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { ImmersivePage } from "../../components/layout/ImmersivePage/ImmersivePage";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { slug } from "../../utils/slug";
import { useProjectsQuery } from "../projects";
import { type TeamBasicsBody, TeamBasicsPanel } from "./components/TeamBasicsPanel";
import { TeamKnowledgeBasePanel } from "./components/TeamKnowledgeBasePanel";
import { LinkProjectDialog } from "./components/LinkProjectDialog";
import { useCreateTeamMutation, useDeleteTeamMutation, useUpdateTeamMutation } from "./mutations";
import { useTeamQuery } from "./queries";

export interface TeamDetailScreenProps {
  /** The team to edit; omitted when creating a new one (the `/teams/new` route). */
  teamId?: string;
}

/**
 * Team detail — the layer between Company and Project that owns a read-only
 * knowledge base. Edits the team's own record: name/desc/companyId (via
 * {@link TeamBasicsPanel}) and its knowledge base (via
 * {@link TeamKnowledgeBasePanel}). Mirrors
 * `features/companies/DetailScreen.tsx`, with the deliberate divergence that a
 * team has no people roster and no budget of its own — those stay
 * company-only.
 *
 * The "member projects" list (which projects link to this team via `teamId`)
 * is the reverse lookup over the shared project registry, exactly like the
 * company detail's member-projects panel. Unlike the company version, "create
 * new project" here does not pre-link the new project to this team (Stage A of
 * the team-knowledge-base plan only wires the project→team selector on the
 * project side, not a `?teamId=` pre-link query param on project creation).
 */
export function DetailScreen({ teamId }: TeamDetailScreenProps) {
  const t = useTranslations("teams");
  const tk = useTranslations();
  const router = useRouter();

  // New-team mode: there is no id yet, so the id-keyed query stays inert and
  // only the basics panel renders (the knowledge base needs a persisted team first).
  const isNew = !teamId;
  const id = teamId ?? "";

  const teamQ = useTeamQuery(id, { enabled: !isNew });
  const projectsQ = useProjectsQuery();
  const createTeam = useCreateTeamMutation();
  const updateTeam = useUpdateTeamMutation();
  const deleteTeam = useDeleteTeamMutation();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linkingProject, setLinkingProject] = useState(false);

  const isSaving = updateTeam.isPending;

  if (!isNew && teamQ.isError) return <QueryError onRetry={() => void teamQ.refetch()} />;
  if (!isNew && teamQ.isPending) return <QueryLoading />;

  // In new mode the id-keyed query is inert; never read its data — the basics
  // panel starts empty and creates the record.
  const team = isNew ? undefined : teamQ.data;

  function saveBasics(body: TeamBasicsBody) {
    if (isNew) {
      // A brand-new team has no existing company link to unlink, so the
      // panel's `null` ("no company" picked) is translated to `undefined` —
      // `CreateTeamSchema.companyId` doesn't accept `null` (only
      // `UpdateTeamSchema.companyId` was re-widened for the clear signal).
      const newId = slug(body.name) || `team-${Date.now()}`;
      createTeam.mutate(
        { body: { ...body, companyId: body.companyId ?? undefined, id: newId } },
        { onSuccess: () => router.replace(`/teams/${newId}`) },
      );
    } else {
      updateTeam.mutate({ params: { id }, body });
    }
  }

  function saveKnowledgeBase(knowledgeBase: KnowledgeBaseSource | null) {
    updateTeam.mutate({ params: { id }, body: { knowledgeBase } });
  }

  // The reverse lookup — every project whose `teamId` points here — over the
  // shared project registry (already fetched app-wide via the same cache key,
  // so this costs no extra request in practice). Mirrors the companies
  // member-projects panel exactly.
  const memberProjects = (projectsQ.data ?? []).filter((p) => p.teamId === id);
  const memberProjectsPanel = (
    <HudPanel
      action={
        <DropDownButton
          icon="plus"
          label={t("memberProjects.addExisting")}
          menuAriaLabel={t("memberProjects.add")}
          menuItems={[
            {
              id: "create-new",
              label: t("memberProjects.createNew"),
              icon: "spark",
              onSelect: () => router.push("/projects/new"),
            },
          ]}
          onClick={() => setLinkingProject(true)}
          size="sm"
        />
      }
      surface="glass"
      title={t("memberProjects.title")}
    >
      {memberProjects.length === 0 ? (
        <Typography data-testid="member-projects-empty" size="sm" type="note" variant="tertiary">
          {t("memberProjects.empty")}
        </Typography>
      ) : (
        <Stack wrap direction="row" gap="100">
          {memberProjects.map((project) => (
            <Pressable key={project.id} onClick={() => router.push(`/projects/${project.id}`)}>
              <Tag tone="accent">{project.name}</Tag>
            </Pressable>
          ))}
        </Stack>
      )}
    </HudPanel>
  );

  return (
    <ImmersivePage backHref="/teams" title={isNew ? t("newTeam") : (team?.name ?? "")}>
      <Container padding={["300", "350"]}>
        <PageContainer>
          <Stack gap="300">
            <TeamBasicsPanel
              isNew={isNew}
              key={team?.id ?? "new"}
              onDelete={isNew ? undefined : () => setConfirmDelete(true)}
              onSave={saveBasics}
              saving={createTeam.isPending || updateTeam.isPending}
              team={team}
            />

            {!isNew && team && (
              <>
                <TeamKnowledgeBasePanel
                  key={`kb-${team.id}-${team.knowledgeBase ? "set" : "none"}`}
                  knowledgeBase={team.knowledgeBase}
                  onSave={saveKnowledgeBase}
                  saving={isSaving}
                />
                {memberProjectsPanel}
              </>
            )}
          </Stack>
        </PageContainer>
      </Container>

      {confirmDelete && team && (
        <ConfirmDeleteDialog
          body={t("deleteBody", { name: team.name })}
          cancelLabel={tk("common.cancel")}
          confirmLabel={t("delete")}
          icon="x"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            deleteTeam.mutate(
              { params: { id } },
              {
                onSuccess: () => {
                  setConfirmDelete(false);
                  router.push("/teams");
                },
              },
            )
          }
          pending={deleteTeam.isPending}
          title={t("deleteTitle")}
        />
      )}

      {linkingProject && <LinkProjectDialog onClose={() => setLinkingProject(false)} teamId={id} />}
    </ImmersivePage>
  );
}
