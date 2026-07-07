"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { ProjectPerson } from "@zibby/contracts";
import {
  Button,
  Pressable,
  Stack,
  Tag,
  TextInputField,
  Toggle,
  Tooltip,
  Typography,
} from "@zibby/design-system";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { slug } from "../../utils/slug";
import { useProjectsQuery } from "../projects";
import { type CompanyBasicsBody, CompanyBasicsPanel } from "./components/CompanyBasicsPanel";
import { useCreateCompanyMutation, useDeleteCompanyMutation, useUpdateCompanyMutation } from "./mutations";
import { useCompanyQuery } from "./queries";

// ---------------------------------------------------------------------------
// Person row editor — mirrors `features/projects/ProfileScreen.tsx`'s PersonRow.
// The company's roster is the canonical one a linked project matches/overrides
// by person `id` (Phase 70's merge, not implemented here — this screen only
// edits the company's own data).
// ---------------------------------------------------------------------------

interface PersonRowProps {
  person: ProjectPerson;
  nameLabel: string;
  roleLabel: string;
  commsStyleLabel: string;
  commsStyleHelp: string;
  commsStylePlaceholder: string;
  removeLabel: string;
  vipLabel: string;
  namePlaceholder: string;
  rolePlaceholder: string;
  onChange: (p: ProjectPerson) => void;
  onRemove: () => void;
}

function PersonRow({
  person,
  nameLabel,
  roleLabel,
  commsStyleLabel,
  commsStyleHelp,
  commsStylePlaceholder,
  removeLabel,
  vipLabel,
  namePlaceholder,
  rolePlaceholder,
  onChange,
  onRemove,
}: PersonRowProps) {
  return (
    <Stack align="end" direction="row" gap="100">
      <TextInputField
        data-testid="person-name"
        label={nameLabel}
        onChange={(e) => onChange({ ...person, name: e.target.value })}
        placeholder={namePlaceholder}
        value={person.name}
      />
      <TextInputField
        data-testid="person-role"
        label={roleLabel}
        onChange={(e) => onChange({ ...person, role: e.target.value })}
        placeholder={rolePlaceholder}
        value={person.role}
      />
      <TextInputField
        data-testid="person-comms-style"
        label={commsStyleLabel}
        labelHint={
          <Tooltip content={commsStyleHelp}>
            <Button aria-label={commsStyleHelp} icon="help" intent="ghost" size="sm" />
          </Tooltip>
        }
        onChange={(e) => onChange({ ...person, comms_style: e.target.value || undefined })}
        placeholder={commsStylePlaceholder}
        value={person.comms_style ?? ""}
      />
      <Stack align="center" direction="row" gap="75">
        <Toggle
          checked={person.vip ?? false}
          data-testid="person-vip"
          label={vipLabel}
          onChange={(checked) => onChange({ ...person, vip: checked || undefined })}
          size="sm"
        />
        <Typography mono size="xs" type="note" variant="secondary">
          VIP
        </Typography>
      </Stack>
      <Button aria-label={removeLabel} icon="x" intent="ghost" onClick={onRemove} size="sm" />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export interface CompanyDetailScreenProps {
  /** The company to edit; omitted when creating a new one (the `/companies/new` route). */
  companyId?: string;
}

/**
 * Company (firma) detail — the super-entity above Project (Phase 68). Edits the
 * company's own record: name/desc/default budget (via {@link CompanyBasicsPanel})
 * and the canonical people roster. Mirrors `features/projects/ProfileScreen.tsx`,
 * trimmed to what a company owns today — no autonomy policy, daily rhythm,
 * secrets or integrations (those stay project-only), and no tabs since there is
 * only one section's worth of content.
 *
 * The "member projects" list (which projects link to this company via
 * `companyId`) is the reverse lookup over the shared project registry — the
 * project↔company wiring (Phase 72) that fills it in.
 */
export function DetailScreen({ companyId }: CompanyDetailScreenProps) {
  const t = useTranslations("companies");
  const tk = useTranslations();
  const router = useRouter();

  // New-company mode: there is no id yet, so the id-keyed query stays inert and
  // only the basics panel renders (the roster needs a persisted company first).
  const isNew = !companyId;
  const id = companyId ?? "";

  const companyQ = useCompanyQuery(id, { enabled: !isNew });
  const projectsQ = useProjectsQuery();
  const createCompany = useCreateCompanyMutation();
  const updateCompany = useUpdateCompanyMutation();
  const deleteCompany = useDeleteCompanyMutation();

  // Controlled state — null means "follow server data".
  const [people, setPeople] = useState<ProjectPerson[] | null>(null);
  const effectivePeople: ProjectPerson[] = people ?? companyQ.data?.people ?? [];

  const [confirmDelete, setConfirmDelete] = useState(false);

  const isSaving = updateCompany.isPending;

  if (!isNew && companyQ.isError) return <QueryError onRetry={() => void companyQ.refetch()} />;
  if (!isNew && companyQ.isPending) return <QueryLoading />;

  // In new mode the id-keyed query is inert; never read its data — the basics
  // panel starts empty and creates the record.
  const company = isNew ? undefined : companyQ.data;

  function saveBasics(body: CompanyBasicsBody) {
    if (isNew) {
      const newId = slug(body.name) || `company-${Date.now()}`;
      createCompany.mutate(
        { body: { ...body, id: newId } },
        { onSuccess: () => router.replace(`/companies/${newId}`) },
      );
    } else {
      updateCompany.mutate({ params: { id }, body });
    }
  }

  function saveTeam() {
    const cleanPeople = effectivePeople.filter((p) => p.name.trim() && p.role.trim());
    updateCompany.mutate({ params: { id }, body: { people: cleanPeople } }, { onSuccess: () => setPeople(null) });
  }

  const teamPanel = (
    <HudPanel
      action={
        <Button
          data-testid="save-team"
          disabled={isSaving}
          icon="check"
          intent="primary"
          onClick={saveTeam}
          size="sm"
        >
          {tk("common.save")}
        </Button>
      }
      title={t("team.title")}
    >
      <Stack gap="150">
        {effectivePeople.length === 0 && (
          <Typography size="sm" type="note" variant="tertiary">
            {t("team.empty")}
          </Typography>
        )}
        {effectivePeople.map((person, i) => (
          <PersonRow
            commsStyleHelp={t("team.commsStyleHelp")}
            commsStyleLabel={t("team.commsStyle")}
            commsStylePlaceholder={t("team.commsStylePlaceholder")}
            key={i}
            nameLabel={t("team.name")}
            namePlaceholder={t("team.namePlaceholder")}
            onChange={(p) => setPeople(effectivePeople.map((prev, j) => (j === i ? p : prev)))}
            onRemove={() => setPeople(effectivePeople.filter((_, j) => j !== i))}
            person={person}
            removeLabel={t("team.remove")}
            roleLabel={t("team.role")}
            rolePlaceholder={t("team.rolePlaceholder")}
            vipLabel={t("team.vip")}
          />
        ))}
        <Stack align="start" direction="row">
          <Button
            data-testid="add-person"
            icon="plus"
            intent="ghost"
            onClick={() => setPeople([...effectivePeople, { name: "", role: "" }])}
            size="sm"
          >
            {t("team.add")}
          </Button>
        </Stack>
      </Stack>
    </HudPanel>
  );

  // Phase 72: the reverse lookup — every project whose `companyId` points here —
  // over the shared project registry (already fetched app-wide via the same
  // cache key, so this costs no extra request in practice).
  const memberProjects = (projectsQ.data ?? []).filter((p) => p.companyId === id);
  const memberProjectsPanel = (
    <HudPanel title={t("memberProjects.title")}>
      {memberProjects.length === 0 ? (
        <Typography
          data-testid="member-projects-empty"
          size="sm"
          type="note"
          variant="tertiary"
        >
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
    <PageContainer>
      <PageHeader
        actions={
          <Button intent="ghost" onClick={() => router.push("/companies")} size="sm">
            {tk("common.back")}
          </Button>
        }
        title={isNew ? t("newCompany") : (company?.name ?? "")}
      />

      <Stack gap="300">
        <CompanyBasicsPanel
          company={company}
          isNew={isNew}
          key={company?.id ?? "new"}
          onDelete={isNew ? undefined : () => setConfirmDelete(true)}
          onSave={saveBasics}
          saving={createCompany.isPending || updateCompany.isPending}
        />

        {!isNew && company && (
          <>
            {teamPanel}
            {memberProjectsPanel}
          </>
        )}
      </Stack>

      {confirmDelete && company && (
        <ConfirmDeleteDialog
          body={t("deleteBody", { name: company.name })}
          cancelLabel={tk("common.cancel")}
          confirmLabel={t("delete")}
          icon="x"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            deleteCompany.mutate(
              { params: { id } },
              {
                onSuccess: () => {
                  setConfirmDelete(false);
                  router.push("/companies");
                },
              },
            )
          }
          pending={deleteCompany.isPending}
          title={t("deleteTitle")}
        />
      )}
    </PageContainer>
  );
}
