"use client";

import type { ChatAbout, CiJob, ProjectCi } from "@zibby/contracts";
import {
  AnchoredSheet,
  Button,
  Container,
  SheetBlock,
  SheetSection,
  type SheetTone,
  Stack,
  TextLink,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChatAboutButton } from "../../../chat/components/ChatAboutButton";
import { useFixProjectCiMutation } from "../../../projects/mutations";
import { useProjectCiQuery, useProjectsQuery } from "../../../projects/queries";
import { CiStateIcon } from "../../widgets/ProjectStatusWidget";
import { type SheetProps, geometry } from "./sheetTypes";

export enum ProjectSheetTestId {
  FixCi = "project-sheet-fix-ci",
  RepoLink = "project-sheet-repo-link",
  Workflow = "project-sheet-workflow",
  Job = "project-sheet-job",
  Step = "project-sheet-step",
  Message = "project-sheet-message",
}

const TONE: Record<ProjectCi["state"], SheetTone> = {
  passing: "done",
  failing: "error",
  running: "working",
  pending: "thinking",
  cancelled: "idle",
  skipped: "idle",
  none: "idle",
  error: "blocked",
};

/** The chat context: the branch state plus every failing job / step (data, not instructions). */
function ciAbout(name: string, ci: ProjectCi): ChatAbout {
  const failing = ci.workflows.flatMap((w) =>
    w.jobs
      .filter((j) => j.state === "failing")
      .map((j) => {
        const steps = j.steps.filter((s) => s.state === "failing").map((s) => s.name);
        return `- ${w.name} / ${j.name}${steps.length ? `: ${steps.join(", ")}` : ""}${j.url ? ` (${j.url})` : ""}`;
      }),
  );
  return {
    kind: "project-ci",
    id: ci.projectId,
    label: `CI ${name}${ci.branch ? ` @ ${ci.branch}` : ""}`.slice(0, 200),
    ...(ci.repoUrl ? { href: ci.repoUrl } : {}),
    details: [
      `Base branch ${ci.branch ?? "?"} at ${ci.headSha ?? "?"}: ${ci.state}.`,
      ...(failing.length ? ["Failing:", ...failing] : []),
    ].join("\n"),
  };
}

function JobBlock({ job, stateLabel }: { job: CiJob; stateLabel: (s: CiJob["state"]) => string }) {
  return (
    <Stack data-testid={ProjectSheetTestId.Job} gap="50">
      <Stack align="center" direction="row" gap="75">
        <CiStateIcon label={stateLabel(job.state)} state={job.state} />
        {job.url ? (
          <TextLink href={job.url} rel="noreferrer" target="_blank">
            {job.name}
          </TextLink>
        ) : (
          <Typography as="span" type="labelSm">
            {job.name}
          </Typography>
        )}
      </Stack>
      <Container padding={["0", "0", "0", "300"]}>
        <Stack gap="25">
          {job.steps.map((s) => (
            <Stack
              align="center"
              data-state={s.state}
              data-testid={ProjectSheetTestId.Step}
              direction="row"
              gap="75"
              key={s.number}
            >
              <CiStateIcon label={stateLabel(s.state)} state={s.state} />
              <Typography
                as="span"
                size="sm"
                tone={s.state === "failing" ? "bad" : undefined}
                type="body"
                variant={s.state === "failing" ? undefined : "secondary"}
              >
                {`${s.number}. ${s.name}`}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Container>
    </Stack>
  );
}

/**
 * Project detail (Project status widget): the base branch's CI per workflow → job → step, like
 * GitHub's checks view. The title opens the project page; the repo link sits under it. Actions: "Discuss in chat", and on red
 * CI "Opravit CI" — a task whose output is a PR (ZIBBY opens it, the operator merges).
 */
export function ProjectSheet({ id, anchor, onClose }: SheetProps) {
  const t = useTranslations();
  const router = useRouter();
  const ts = useTranslations("bridge.sheet.project");
  const tw = useTranslations("bridge.widgets.projectStatus");
  const { data: projects } = useProjectsQuery();
  const { data: ci } = useProjectCiQuery(id);
  const fix = useFixProjectCiMutation();
  const [message, setMessage] = useState<{ text: string; taskId?: string } | null>(null);
  const project = projects?.find((p) => p.id === id);
  if (!project) return null;

  const state = ci?.state ?? "none";
  // An open fix task for this red commit (server-side `baseFixCi`), or one this click just
  // created (before the CI refetch carries it) — the button is gone, the note says it runs.
  const fixTaskId = ci?.fixTaskId ?? (fix.isSuccess ? fix.data.body.taskId : undefined);
  const note = message ?? (fixTaskId ? { text: ts("fixRunning"), taskId: fixTaskId } : null);
  const stateLabel = (s: ProjectCi["state"]) => tw(`state.${s}`);
  const onFix = () =>
    fix.mutate(
      { params: { projectId: id }, body: {} },
      {
        onSuccess: (res) => setMessage({ text: ts("fixStarted"), taskId: res.body.taskId }),
        onError: (err) =>
          setMessage({
            text:
              "status" in err && (err.status === 409 || err.status === 422)
                ? ts("fixRefused", { reason: err.body.message })
                : ts("fixFailed"),
          }),
      },
    );

  return (
    <AnchoredSheet
      {...geometry(anchor)}
      actions={
        <>
          {ci ? <ChatAboutButton about={ciAbout(project.name, ci)} /> : null}
          {state === "failing" && !fixTaskId ? (
            <Button
              data-testid={ProjectSheetTestId.FixCi}
              disabled={fix.isPending}
              icon="bolt"
              intent="primary"
              loading={fix.isPending}
              onClick={onFix}
              size="sm"
            >
              {ts("fixCi")}
            </Button>
          ) : null}
        </>
      }
      chips={[...(ci?.branch ? [ci.branch] : []), ...(ci?.headSha ? [ci.headSha.slice(0, 7)] : [])]}
      closeLabel={t("bridge.sheet.close")}
      footerNote={
        ci?.state === "error"
          ? ts("unavailable", { reason: ci.error ?? "" })
          : ci?.provider === "gitlab"
            ? ts("gitlabDeferred")
            : undefined
      }
      kind={t("bridge.sheet.kind.project")}
      meta={
        ci?.repoUrl ? (
          <TextLink
            data-testid={ProjectSheetTestId.RepoLink}
            href={ci.repoUrl}
            rel="noreferrer"
            target="_blank"
          >
            {ts("openRepo")}
          </TextLink>
        ) : undefined
      }
      onClose={onClose}
      onTitleClick={() => router.push(`/projects/${encodeURIComponent(id)}` as Route)}
      stateLabel={stateLabel(state)}
      title={project.name}
      tone={TONE[state]}
    >
      {note ? (
        <Stack data-testid={ProjectSheetTestId.Message} direction="row" gap="75">
          <Typography as="span" size="sm" type="body">
            {note.text}
          </Typography>
          {note.taskId ? (
            <TextLink href={`/work/tasks/${encodeURIComponent(note.taskId)}`}>
              {ts("openTask")}
            </TextLink>
          ) : null}
        </Stack>
      ) : null}
      {ci && ci.workflows.length === 0 ? (
        <Typography size="sm" type="note" variant="secondary">
          {ts("noRuns")}
        </Typography>
      ) : null}
      {ci?.workflows.map((w) => (
        <SheetSection key={w.id}>
          <Stack data-state={w.state} data-testid={ProjectSheetTestId.Workflow} gap="100">
            <SheetBlock label={`${w.name} · ${stateLabel(w.state)}`}>
              <Stack gap="150">
                {w.jobs.map((j) => (
                  <JobBlock job={j} key={j.id} stateLabel={stateLabel} />
                ))}
              </Stack>
            </SheetBlock>
          </Stack>
        </SheetSection>
      ))}
    </AnchoredSheet>
  );
}
