"use client";

import type { ProjectAutonomyPolicy, ProjectDailyRhythm, ProjectPerson } from "@zibby/contracts";
import {
  Button,
  CodeBlock,
  Divider,
  Pressable,
  SelectField,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Tag,
  TextInputField,
  Toggle,
  Tooltip,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { slug } from "../../utils/slug";
import { InboxPanel } from "../integrations/components/InboxPanel";
import { type ProjectBasicsBody, ProjectBasicsPanel } from "./components/ProjectBasicsPanel";
import { ProjectCiStatusChip } from "./components/ProjectCiStatusChip";
import { ProjectCompanyPanel } from "./components/ProjectCompanyPanel";
import { ProjectIntegrationActivityPanel } from "./components/ProjectIntegrationActivityPanel";
import { ProjectIntegrationsPanel } from "./components/ProjectIntegrationsPanel";
import { ProjectRunSummary } from "./components/ProjectRunSummary";
import { ProjectSecretsPanel } from "./components/ProjectSecretsPanel";
import {
  useCreateProjectMutation,
  useDeleteProjectMutation,
  useDeleteProjectSecretsMutation,
  useSetProjectSecretsMutation,
  useUpdateProjectMutation,
  useUpdateProjectProfileMutation,
} from "./mutations";
import {
  useProjectCategoriesQuery,
  useProjectProfileQuery,
  useProjectQuery,
  useProjectStandupQuery,
} from "./queries";

// ---------------------------------------------------------------------------
// Autonomy action vocabulary
// ---------------------------------------------------------------------------

/**
 * Curated action-verb vocabulary offered in the autonomy policy multi-selects.
 * Mirrors the gate's ask-floor actions plus the routine verbs ZIBBY can handle on
 * its own. The schema stores free-form strings, so a project's already-saved custom
 * verbs are unioned in at render time (see {@link actionOptions}) — never dropped.
 */
const AUTONOMY_ACTIONS = [
  "reply",
  "create_task",
  "summarize",
  "investigate",
  "draft",
  "run_pipeline",
  "post_status",
  "send_email",
  "pr.open",
  "git.push",
  "git.force_push",
  "pr.merge",
  "gh.api_write",
  "delete",
  "purchase",
  "payment",
  "jira.create_issue",
] as const;

/** Curated verbs first, then any custom values already on the policy, de-duped. */
function actionOptions(current: string[]): { value: string; label: string }[] {
  const values = Array.from(new Set<string>([...AUTONOMY_ACTIONS, ...current]));
  return values.map((value) => ({ value, label: value }));
}

// ---------------------------------------------------------------------------
// Tabs — each is a directly addressable `?tab=` URL
// ---------------------------------------------------------------------------

const PROJECT_TABS = ["overview", "profile", "secrets", "integrations"] as const;
type ProjectTab = (typeof PROJECT_TABS)[number];

function asProjectTab(value: string | null): ProjectTab {
  return (PROJECT_TABS as readonly string[]).includes(value ?? "")
    ? (value as ProjectTab)
    : "overview";
}

// ---------------------------------------------------------------------------
// Person row editor
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

export interface ProfileScreenProps {
  /** The project to edit; omitted when creating a new one (the `/projects/new` route). */
  projectId?: string;
}

export function ProfileScreen({ projectId }: ProfileScreenProps) {
  const t = useTranslations("projects.profile");
  const tp = useTranslations("projects");
  const tk = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  // New-project mode: there is no id yet, so the id-keyed queries stay inert and
  // only the basics panel renders (the rest needs a persisted project first).
  const isNew = !projectId;
  const id = projectId ?? "";

  // The tab is a directly addressable `?tab=` URL: read once as the initial tab
  // (deep-linkable) and write back on change for shareability — the same read-once
  // /write-on-change pattern the runs screen uses for `?run=`/`?filter=`. The draft
  // editor state below lives on this screen (not in the unmounted TabPanel), so
  // switching tabs preserves unsaved edits.
  const initialTab = asProjectTab(searchParams.get("tab"));
  const setTab = (tab: string) => {
    const next = asProjectTab(tab);
    router.replace(next === "overview" ? `/projects/${id}` : `/projects/${id}?tab=${next}`);
  };

  const projectQ = useProjectQuery(id, { enabled: !isNew });
  const profileQ = useProjectProfileQuery(id, { enabled: !isNew });
  const standupQ = useProjectStandupQuery(id, { enabled: !isNew });
  const { data: categories = [] } = useProjectCategoriesQuery();
  const updateProfile = useUpdateProjectProfileMutation(id);
  const createProject = useCreateProjectMutation();
  const updateProject = useUpdateProjectMutation();
  const deleteProject = useDeleteProjectMutation();
  const setSecrets = useSetProjectSecretsMutation();
  const deleteSecrets = useDeleteProjectSecretsMutation();

  // Controlled state — null means "follow server data"
  const [people, setPeople] = useState<ProjectPerson[] | null>(null);
  const effectivePeople: ProjectPerson[] = people ?? profileQ.data?.identity?.people ?? [];

  const [autonomy, setAutonomy] = useState<ProjectAutonomyPolicy | null>(null);
  const effectiveAutonomy: ProjectAutonomyPolicy = autonomy ?? profileQ.data?.autonomy_policy ?? {};

  const [rhythm, setRhythm] = useState<ProjectDailyRhythm | null>(null);
  const effectiveRhythm: ProjectDailyRhythm = rhythm ?? profileQ.data?.daily_rhythm ?? {};

  const [confirmDelete, setConfirmDelete] = useState(false);

  const isSaving = updateProfile.isPending;

  if (!isNew && projectQ.isError) return <QueryError onRetry={() => void projectQ.refetch()} />;
  if (!isNew && projectQ.isPending) return <QueryLoading />;

  // In new mode the id-keyed query is inert; never read its data — the basics panel
  // starts empty and creates the record.
  const project = isNew ? undefined : projectQ.data;

  function saveBasics(body: ProjectBasicsBody) {
    if (isNew) {
      const newId = slug(body.name) || `project-${Date.now()}`;
      createProject.mutate(
        { body: { ...body, id: newId } },
        { onSuccess: () => router.replace(`/projects/${newId}`) },
      );
    } else {
      updateProject.mutate({ params: { id }, body });
    }
  }

  function saveTeam() {
    const cleanPeople = effectivePeople.filter((p) => p.name.trim() && p.role.trim());
    updateProfile.mutate(
      { params: { id }, body: { identity: { people: cleanPeople } } },
      { onSuccess: () => setPeople(null) },
    );
  }

  function saveAutonomy() {
    const canDoAlone = (effectiveAutonomy.can_do_alone ?? []).filter(Boolean);
    const alwaysAsk = (effectiveAutonomy.always_ask ?? []).filter(Boolean);
    updateProfile.mutate(
      {
        params: { id },
        body: {
          autonomy_policy: {
            ...effectiveAutonomy,
            can_do_alone: canDoAlone.length > 0 ? canDoAlone : undefined,
            always_ask: alwaysAsk.length > 0 ? alwaysAsk : undefined,
          },
        },
      },
      { onSuccess: () => setAutonomy(null) },
    );
  }

  function saveRhythm() {
    updateProfile.mutate(
      { params: { id }, body: { daily_rhythm: effectiveRhythm } },
      { onSuccess: () => setRhythm(null) },
    );
  }

  // Explicit label map avoids dynamic key interpolation (not supported by next-intl types).
  const respondAsLabels: Record<"autonomous" | "draft_only", string> = {
    autonomous: t("autonomy.autonomous"),
    draft_only: t("autonomy.draftOnly"),
  };

  // The core record — also the only thing `/projects/new` shows.
  const basicsPanel = (
    <ProjectBasicsPanel
      categories={categories}
      isNew={isNew}
      key={project?.id ?? "new"}
      onDelete={isNew ? undefined : () => setConfirmDelete(true)}
      onSave={saveBasics}
      project={project}
      saving={createProject.isPending || updateProject.isPending}
    />
  );

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

  const autonomyPanel = (
    <HudPanel
      action={
        <Button
          data-testid="save-autonomy"
          disabled={isSaving}
          icon="check"
          intent="primary"
          onClick={saveAutonomy}
          size="sm"
        >
          {tk("common.save")}
        </Button>
      }
      title={t("autonomy.title")}
    >
      <Stack gap="200">
        <Stack gap="75">
          <Typography mono size="sm" type="note" variant="secondary">
            {t("autonomy.respondAs")}
          </Typography>
          <Stack direction="row" gap="75">
            {(["autonomous", "draft_only"] as const).map((val) => (
              <Pressable
                key={val}
                onClick={() =>
                  setAutonomy({
                    ...effectiveAutonomy,
                    respond_as: effectiveAutonomy.respond_as === val ? undefined : val,
                  })
                }
              >
                <Tag tone={effectiveAutonomy.respond_as === val ? "accent" : "neutral"}>
                  {respondAsLabels[val]}
                </Tag>
              </Pressable>
            ))}
          </Stack>
        </Stack>

        <Stack align="center" direction="row" gap="150">
          <Toggle
            checked={effectiveAutonomy.vip_escalation ?? false}
            data-testid="vip-escalation"
            label={t("autonomy.vipEscalation")}
            onChange={(checked) =>
              setAutonomy({ ...effectiveAutonomy, vip_escalation: checked || undefined })
            }
            size="sm"
          />
          <Typography mono size="sm" type="note" variant="secondary">
            {t("autonomy.vipEscalation")}
          </Typography>
        </Stack>

        <Stack gap="75">
          <Typography size="xs" type="note" variant="tertiary">
            {t("autonomy.canDoAloneHint")}
          </Typography>
          <SelectField
            multi
            showSelectAll
            deselectAllLabel={t("autonomy.deselectAll")}
            label={t("autonomy.canDoAlone")}
            onValueChange={(can_do_alone) => setAutonomy({ ...effectiveAutonomy, can_do_alone })}
            options={actionOptions(effectiveAutonomy.can_do_alone ?? [])}
            placeholder={t("autonomy.actionsPlaceholder")}
            removeLabel={t("autonomy.removeAction")}
            selectAllLabel={t("autonomy.selectAll")}
            value={effectiveAutonomy.can_do_alone ?? []}
          />
        </Stack>

        <Stack gap="75">
          <Typography size="xs" type="note" variant="tertiary">
            {t("autonomy.alwaysAskHint")}
          </Typography>
          <SelectField
            multi
            showSelectAll
            deselectAllLabel={t("autonomy.deselectAll")}
            label={t("autonomy.alwaysAsk")}
            onValueChange={(always_ask) => setAutonomy({ ...effectiveAutonomy, always_ask })}
            options={actionOptions(effectiveAutonomy.always_ask ?? [])}
            placeholder={t("autonomy.actionsPlaceholder")}
            removeLabel={t("autonomy.removeAction")}
            selectAllLabel={t("autonomy.selectAll")}
            value={effectiveAutonomy.always_ask ?? []}
          />
        </Stack>
      </Stack>
    </HudPanel>
  );

  const rhythmPanel = (
    <HudPanel
      action={
        <Button
          data-testid="save-rhythm"
          disabled={isSaving}
          icon="check"
          intent="primary"
          onClick={saveRhythm}
          size="sm"
        >
          {tk("common.save")}
        </Button>
      }
      title={t("rhythm.title")}
    >
      <Stack gap="150">
        <TextInputField
          data-testid="standup-time"
          hint={t("rhythm.standupTimeHint")}
          label={t("rhythm.standupTime")}
          onChange={(e) =>
            setRhythm({ ...effectiveRhythm, standup_time: e.target.value || undefined })
          }
          placeholder="09:30"
          value={effectiveRhythm.standup_time ?? ""}
        />
        <TextInputField
          data-testid="active-hours"
          label={t("rhythm.activeHours")}
          onChange={(e) =>
            setRhythm({ ...effectiveRhythm, active_hours: e.target.value || undefined })
          }
          placeholder="09:00-18:00"
          value={effectiveRhythm.active_hours ?? ""}
        />
        <TextInputField
          data-testid="standup-format"
          label={t("rhythm.format")}
          onChange={(e) => setRhythm({ ...effectiveRhythm, format: e.target.value || undefined })}
          placeholder={t("rhythm.formatPlaceholder")}
          value={effectiveRhythm.format ?? ""}
        />
      </Stack>
    </HudPanel>
  );

  const standupPanel = standupQ.data ? (
    <HudPanel title={t("standup.title")}>
      <Stack gap="75">
        <Typography mono size="xs" type="note" variant="tertiary">
          {standupQ.data.date}
        </Typography>
        <CodeBlock data-testid="standup-text" text={standupQ.data.text} />
      </Stack>
    </HudPanel>
  ) : null;

  return (
    <PageContainer>
      <PageHeader
        actions={
          <>
            {/* CI health chip (N4b) — state readout, renders nothing without a watched CI */}
            {!isNew && <ProjectCiStatusChip projectId={id} />}
            <Button intent="ghost" onClick={() => router.push("/projects")} size="sm">
              {tk("common.back")}
            </Button>
          </>
        }
        subtitle={isNew ? undefined : project?.path}
        title={isNew ? tp("newProject") : (project?.name ?? "")}
      />

      {isNew ? (
        <Stack gap="300">{basicsPanel}</Stack>
      ) : project ? (
        <Tabs defaultValue={initialTab} onValueChange={setTab}>
          <TabList>
            <Tab value="overview">{t("tabs.overview")}</Tab>
            <Tab value="profile">{t("tabs.profile")}</Tab>
            <Tab value="secrets">{t("tabs.secrets")}</Tab>
            <Tab value="integrations">{t("tabs.integrations")}</Tab>
          </TabList>

          <TabPanel value="overview">
            <Stack gap="300">
              {basicsPanel}
              <ProjectCompanyPanel companyId={project.companyId} projectId={id} />
              <ProjectRunSummary projectId={id} />
            </Stack>
          </TabPanel>

          <TabPanel value="profile">
            <Stack gap="300">
              {teamPanel}
              <Divider />
              {autonomyPanel}
              <Divider />
              {rhythmPanel}
              {standupPanel && (
                <>
                  <Divider />
                  {standupPanel}
                </>
              )}
            </Stack>
          </TabPanel>

          <TabPanel value="secrets">
            <Stack gap="300">
              <ProjectSecretsPanel
                hasSecrets={project.hasSecrets}
                onClear={() => deleteSecrets.mutate({ params: { id } })}
                onSet={(secrets) => setSecrets.mutate({ params: { id }, body: secrets })}
                saving={setSecrets.isPending || deleteSecrets.isPending}
              />
            </Stack>
          </TabPanel>

          <TabPanel value="integrations">
            <Stack gap="300">
              {/* Channels owned by this project (one project = one company) */}
              <ProjectIntegrationsPanel projectId={id} />
              {/* This project's recent channel items */}
              <InboxPanel projectId={id} />
              {/* What the project's integrations processed + outcome */}
              <ProjectIntegrationActivityPanel projectId={id} />
            </Stack>
          </TabPanel>
        </Tabs>
      ) : null}

      {confirmDelete && project && (
        <ConfirmDeleteDialog
          body={tp("deleteBody", { name: project.name })}
          cancelLabel={tk("common.cancel")}
          confirmLabel={tp("delete")}
          icon="x"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            deleteProject.mutate(
              { params: { id } },
              {
                onSuccess: () => {
                  setConfirmDelete(false);
                  router.push("/projects");
                },
              },
            )
          }
          pending={deleteProject.isPending}
          title={tp("deleteTitle")}
        />
      )}
    </PageContainer>
  );
}
