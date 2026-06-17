"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Button,
  CodeBlock,
  Divider,
  Pressable,
  Stack,
  Tag,
  TextInputField,
  Toggle,
  Typography,
} from "@zibby/design-system";
import type {
  ProjectAutonomyPolicy,
  ProjectDailyRhythm,
  ProjectPerson,
} from "@zibby/contracts";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { useProjectProfileQuery, useProjectQuery, useProjectStandupQuery } from "./queries";
import { useUpdateProjectProfileMutation } from "./mutations";

// ---------------------------------------------------------------------------
// Person row editor
// ---------------------------------------------------------------------------

interface PersonRowProps {
  person: ProjectPerson;
  nameLabel: string;
  roleLabel: string;
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
  projectId: string;
}

export function ProfileScreen({ projectId }: ProfileScreenProps) {
  const t = useTranslations("projects.profile");
  const tk = useTranslations();
  const router = useRouter();

  const projectQ = useProjectQuery(projectId);
  const profileQ = useProjectProfileQuery(projectId);
  const standupQ = useProjectStandupQuery(projectId);
  const updateProfile = useUpdateProjectProfileMutation(projectId);

  // Controlled state — null means "follow server data"
  const [people, setPeople] = useState<ProjectPerson[] | null>(null);
  const effectivePeople: ProjectPerson[] =
    people ?? profileQ.data?.identity?.people ?? [];

  const [autonomy, setAutonomy] = useState<ProjectAutonomyPolicy | null>(null);
  const effectiveAutonomy: ProjectAutonomyPolicy =
    autonomy ?? profileQ.data?.autonomy_policy ?? {};

  const [rhythm, setRhythm] = useState<ProjectDailyRhythm | null>(null);
  const effectiveRhythm: ProjectDailyRhythm =
    rhythm ?? profileQ.data?.daily_rhythm ?? {};

  const isSaving = updateProfile.isPending;

  if (projectQ.isError) return <QueryError onRetry={() => void projectQ.refetch()} />;
  if (projectQ.isPending) return <QueryLoading />;

  const project = projectQ.data;

  function saveTeam() {
    const cleanPeople = effectivePeople.filter((p) => p.name.trim() && p.role.trim());
    updateProfile.mutate(
      { params: { id: projectId }, body: { identity: { people: cleanPeople } } },
      { onSuccess: () => setPeople(null) },
    );
  }

  function saveAutonomy() {
    const canDoAlone = (effectiveAutonomy.can_do_alone ?? []).filter(Boolean);
    const alwaysAsk = (effectiveAutonomy.always_ask ?? []).filter(Boolean);
    updateProfile.mutate(
      {
        params: { id: projectId },
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
      { params: { id: projectId }, body: { daily_rhythm: effectiveRhythm } },
      { onSuccess: () => setRhythm(null) },
    );
  }

  // Explicit label map avoids dynamic key interpolation (not supported by next-intl types).
  const respondAsLabels: Record<"autonomous" | "draft_only", string> = {
    autonomous: t("autonomy.autonomous"),
    draft_only: t("autonomy.draftOnly"),
  };

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button intent="ghost" onClick={() => router.push("/projects")} size="sm">
            {tk("common.back")}
          </Button>
        }
        subtitle={project.path}
        title={project.name}
      />

      <Stack gap="300">
        {/* Team */}
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
                key={i}
                nameLabel={t("team.name")}
                namePlaceholder={t("team.namePlaceholder")}
                onChange={(p) =>
                  setPeople(effectivePeople.map((prev, j) => (j === i ? p : prev)))
                }
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

        <Divider />

        {/* Autonomy */}
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
              <TextInputField
                data-testid="can-do-alone"
                label={t("autonomy.canDoAlone")}
                onChange={(e) =>
                  setAutonomy({
                    ...effectiveAutonomy,
                    can_do_alone: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="reply, create_task, summarize"
                value={(effectiveAutonomy.can_do_alone ?? []).join(", ")}
              />
            </Stack>

            <Stack gap="75">
              <Typography size="xs" type="note" variant="tertiary">
                {t("autonomy.alwaysAskHint")}
              </Typography>
              <TextInputField
                data-testid="always-ask"
                label={t("autonomy.alwaysAsk")}
                onChange={(e) =>
                  setAutonomy({
                    ...effectiveAutonomy,
                    always_ask: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="send_email, merge, delete"
                value={(effectiveAutonomy.always_ask ?? []).join(", ")}
              />
            </Stack>
          </Stack>
        </HudPanel>

        <Divider />

        {/* Daily Rhythm */}
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
              onChange={(e) =>
                setRhythm({ ...effectiveRhythm, format: e.target.value || undefined })
              }
              placeholder={t("rhythm.formatPlaceholder")}
              value={effectiveRhythm.format ?? ""}
            />
          </Stack>
        </HudPanel>

        {standupQ.data && (
          <>
            <Divider />
            <HudPanel title={t("standup.title")}>
              <Stack gap="75">
                <Typography mono size="xs" type="note" variant="tertiary">
                  {standupQ.data.date}
                </Typography>
                <CodeBlock data-testid="standup-text" text={standupQ.data.text} />
              </Stack>
            </HudPanel>
          </>
        )}
      </Stack>
    </PageContainer>
  );
}
