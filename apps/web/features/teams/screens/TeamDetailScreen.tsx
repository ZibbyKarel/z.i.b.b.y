"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import type { KnowledgeBaseSource } from "@zibby/contracts";
import {
  Breadcrumb,
  Button,
  ConfirmDeleteButton,
  Container,
  DataTable,
  type DataTableColumn,
  MetricStrip,
  Panel,
  Row,
  Stack,
  type SubNavLinkComponent,
  Typography,
} from "@zibby/design-system";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { slug } from "../../../utils/slug";
import { useProjectsQuery } from "../../projects";
import { type TeamBasicsBody, TeamBasicsPanel } from "../components/TeamBasicsPanel";
import { TeamKnowledgeBasePanel } from "../components/TeamKnowledgeBasePanel";
import { LinkProjectDialog } from "../components/LinkProjectDialog";
import { useCreateTeamMutation, useDeleteTeamMutation, useUpdateTeamMutation } from "../mutations";
import { useTeamQuery } from "../queries";

export interface TeamDetailScreenProps {
  /** The team to edit; omitted when creating a new one (the `/work/teams/new` route). */
  teamId?: string;
}

interface MemberProjectRow {
  id: string;
  name: string;
  repo?: string;
}

/**
 * `/work/teams/[id]` (ZB-06) — moved from `/teams/[id]` and re-skinned:
 * `MetricStrip` (projects), the linked-projects `DataTable`, and
 * `ConfirmDeleteButton` for delete. A team has no contacts/budget of its own
 * (`TeamSchema` carries neither — those stay company-only, D-003), so this
 * mirrors `CompanyDetailScreen` minus those two panels.
 */
export function TeamDetailScreen({ teamId }: TeamDetailScreenProps) {
  const t = useTranslations("teams");
  const router = useRouter();

  const isNew = !teamId;
  const id = teamId ?? "";

  const teamQ = useTeamQuery(id, { enabled: !isNew });
  const projectsQ = useProjectsQuery();
  const createTeam = useCreateTeamMutation();
  const updateTeam = useUpdateTeamMutation();
  const deleteTeam = useDeleteTeamMutation();

  const [linkingProject, setLinkingProject] = useState(false);
  const isSaving = updateTeam.isPending;

  if (!isNew && teamQ.isError) return <QueryError onRetry={() => void teamQ.refetch()} />;
  if (!isNew && teamQ.isPending) return <QueryLoading />;

  const team = isNew ? undefined : teamQ.data;

  function saveBasics(body: TeamBasicsBody) {
    if (isNew) {
      const newId = slug(body.name) || `team-${Date.now()}`;
      createTeam.mutate(
        { body: { ...body, companyId: body.companyId ?? undefined, id: newId } },
        { onSuccess: () => router.replace(`/work/teams/${newId}` as Route) },
      );
    } else {
      updateTeam.mutate({ params: { id }, body });
    }
  }

  function saveKnowledgeBase(knowledgeBase: KnowledgeBaseSource | null) {
    updateTeam.mutate({ params: { id }, body: { knowledgeBase } });
  }

  const memberProjects = (projectsQ.data ?? []).filter((p) => p.teamId === id);
  const memberProjectRows: MemberProjectRow[] = memberProjects.map((p) => ({
    id: p.id,
    name: p.name,
    repo: p.gitRemote,
  }));
  const columns: DataTableColumn<MemberProjectRow>[] = [
    { key: "id", label: t("memberProjects.columnProject"), width: "flex", render: (r) => r.name },
    {
      key: "repo",
      label: t("memberProjects.columnRepo"),
      width: "md",
      render: (r) => r.repo ?? "—",
    },
  ];

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="250">
        <Breadcrumb
          items={[
            { label: t("title"), href: "/work/teams" },
            { label: isNew ? t("newTeam") : (team?.name ?? "") },
          ]}
          linkComponent={Link as SubNavLinkComponent}
        />

        <Row justify="between">
          <Typography type="h1">{isNew ? t("newTeam") : (team?.name ?? "")}</Typography>
          {!isNew && team && (
            <ConfirmDeleteButton
              confirmLabel={t("deleteTitle")}
              label={t("delete")}
              onConfirm={() =>
                deleteTeam.mutate(
                  { params: { id } },
                  { onSuccess: () => router.push("/work/teams" as Route) },
                )
              }
            />
          )}
        </Row>

        {!isNew && team && (
          <MetricStrip
            columns={3}
            items={[{ label: t("metrics.projects"), value: memberProjects.length }]}
          />
        )}

        <TeamBasicsPanel
          isNew={isNew}
          key={team?.id ?? "new"}
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

            <Panel
              header={<Typography type="h3">{t("memberProjects.title")}</Typography>}
              headerEnd={
                <Button
                  icon="plus"
                  intent="ghost"
                  onClick={() => setLinkingProject(true)}
                  size="sm"
                >
                  {t("memberProjects.addExisting")}
                </Button>
              }
            >
              <DataTable
                columns={columns}
                empty={
                  <Typography size="sm" type="note" variant="tertiary">
                    {t("memberProjects.empty")}
                  </Typography>
                }
                getRowKey={(r) => r.id}
                onRowClick={(r) => router.push(`/work/projects/${r.id}` as Route)}
                rows={memberProjectRows}
              />
            </Panel>
          </>
        )}
      </Stack>

      {linkingProject && <LinkProjectDialog onClose={() => setLinkingProject(false)} teamId={id} />}
    </Container>
  );
}
