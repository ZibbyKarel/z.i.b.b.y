"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import type { ProjectPerson } from "@zibby/contracts";
import {
  Breadcrumb,
  Button,
  ConfirmDeleteButton,
  ContactRow,
  Container,
  DataTable,
  type DataTableColumn,
  MetricStrip,
  Panel,
  Row,
  Stack,
  type SubNavLinkComponent,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { slug } from "../../../utils/slug";
import { useProjectsQuery } from "../../projects";
import { type CompanyBasicsBody, CompanyBasicsPanel } from "../components/CompanyBasicsPanel";
import { LinkProjectDialog } from "../components/LinkProjectDialog";
import {
  useCreateCompanyMutation,
  useDeleteCompanyMutation,
  useUpdateCompanyMutation,
} from "../mutations";
import { useCompanyQuery } from "../queries";

export interface CompanyDetailScreenProps {
  /** The company to edit; omitted when creating a new one (the `/work/companies/new` route). */
  companyId?: string;
}

interface MemberProjectRow {
  id: string;
  name: string;
  repo?: string;
}

/**
 * `/work/companies/[id]` (ZB-06) — moved from `/companies/[id]` and re-skinned:
 * a `MetricStrip` (projects/contacts/budget), the linked-projects `DataTable`,
 * contacts as `ContactRow`s, `ConfirmDeleteButton` for delete, and the
 * "ALL TASKS FOR THIS COMPANY →" link into `/work/tasks?company=<id>`.
 */
export function CompanyDetailScreen({ companyId }: CompanyDetailScreenProps) {
  const t = useTranslations("companies");
  const router = useRouter();

  const isNew = !companyId;
  const id = companyId ?? "";

  const companyQ = useCompanyQuery(id, { enabled: !isNew });
  const projectsQ = useProjectsQuery();
  const createCompany = useCreateCompanyMutation();
  const updateCompany = useUpdateCompanyMutation();
  const deleteCompany = useDeleteCompanyMutation();

  const [people, setPeople] = useState<ProjectPerson[] | null>(null);
  const [newContactName, setNewContactName] = useState("");
  const [newContactRole, setNewContactRole] = useState("");
  const [linkingProject, setLinkingProject] = useState(false);

  if (!isNew && companyQ.isError) return <QueryError onRetry={() => void companyQ.refetch()} />;
  if (!isNew && companyQ.isPending) return <QueryLoading />;

  const company = isNew ? undefined : companyQ.data;
  const effectivePeople: ProjectPerson[] = people ?? company?.people ?? [];

  function saveBasics(body: CompanyBasicsBody) {
    if (isNew) {
      const newId = slug(body.name) || `company-${Date.now()}`;
      createCompany.mutate(
        { body: { ...body, id: newId } },
        { onSuccess: () => router.replace(`/work/companies/${newId}` as Route) },
      );
    } else {
      updateCompany.mutate({ params: { id }, body });
    }
  }

  function persistPeople(next: ProjectPerson[]) {
    updateCompany.mutate(
      { params: { id }, body: { people: next } },
      { onSuccess: () => setPeople(null) },
    );
  }

  function addContact() {
    if (!newContactName.trim() || !newContactRole.trim()) return;
    persistPeople([
      ...effectivePeople,
      { name: newContactName.trim(), role: newContactRole.trim() },
    ]);
    setNewContactName("");
    setNewContactRole("");
  }

  const memberProjects = (projectsQ.data ?? []).filter((p) => p.companyId === id);
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

  const metrics = company
    ? [
        { label: t("metrics.projects"), value: memberProjects.length },
        { label: t("metrics.contacts"), value: effectivePeople.length },
        {
          label: t("metrics.budget"),
          value: company.budget?.monthlyCostCapUsd ? `$${company.budget.monthlyCostCapUsd}` : "—",
        },
      ]
    : [];

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="250">
        <Breadcrumb
          items={[
            { label: t("title"), href: "/work/companies" },
            { label: isNew ? t("newCompany") : (company?.name ?? "") },
          ]}
          linkComponent={Link as SubNavLinkComponent}
        />

        <Row justify="between">
          <Typography type="h1">{isNew ? t("newCompany") : (company?.name ?? "")}</Typography>
          {!isNew && company && (
            <ConfirmDeleteButton
              confirmLabel={t("deleteTitle")}
              label={t("delete")}
              onConfirm={() =>
                deleteCompany.mutate(
                  { params: { id } },
                  { onSuccess: () => router.push("/work/companies" as Route) },
                )
              }
            />
          )}
        </Row>

        {!isNew && company && <MetricStrip columns={3} items={metrics} />}

        <CompanyBasicsPanel
          company={company}
          isNew={isNew}
          key={company?.id ?? "new"}
          onSave={saveBasics}
          saving={createCompany.isPending || updateCompany.isPending}
        />

        {!isNew && company && (
          <>
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

            <Panel header={<Typography type="h3">{t("contactsTitle")}</Typography>}>
              <Stack gap="0">
                {effectivePeople.map((person, i) => (
                  <ContactRow
                    key={i}
                    name={person.name}
                    onRemove={() => persistPeople(effectivePeople.filter((_, j) => j !== i))}
                    onToggleVip={() =>
                      persistPeople(
                        effectivePeople.map((p, j) => (j === i ? { ...p, vip: !p.vip } : p)),
                      )
                    }
                    sub={person.role}
                    vip={person.vip ?? false}
                  />
                ))}
                <Row gap="100">
                  <TextInputField
                    label={t("team.name")}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder={t("team.namePlaceholder")}
                    value={newContactName}
                  />
                  <TextInputField
                    label={t("team.role")}
                    onChange={(e) => setNewContactRole(e.target.value)}
                    placeholder={t("team.rolePlaceholder")}
                    value={newContactRole}
                  />
                  <Button icon="plus" intent="secondary" onClick={addContact} size="sm">
                    {t("team.add")}
                  </Button>
                </Row>
              </Stack>
            </Panel>

            <Row justify="end">
              <Button
                intent="ghost"
                onClick={() => router.push(`/work/tasks?company=${id}` as Route)}
              >
                {t("allTasksLink")}
              </Button>
            </Row>
          </>
        )}
      </Stack>

      {linkingProject && (
        <LinkProjectDialog companyId={id} onClose={() => setLinkingProject(false)} />
      )}
    </Container>
  );
}
