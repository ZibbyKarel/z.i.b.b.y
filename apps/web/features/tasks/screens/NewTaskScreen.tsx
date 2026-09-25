"use client";

import { DEPARTMENTS } from "@zibby/contracts";
import type { Attachment } from "@zibby/contracts";
import {
  Button,
  ChainRouteStrip,
  Container,
  HighlightTextAreaField,
  IconTile,
  Panel,
  SelectField,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { chainRouteGates, chainRouteSteps, useChainsQuery } from "../../chains";
import { useProjectsQuery } from "../../projects";
import { TaskAttachments } from "../components/TaskAttachments";
import { useClassifyTaskMutation, useCreateTaskMutation } from "../mutations";
import { extractPathRanges, extractPaths, toClientTarget } from "../task";

const ENTRY_COO = "coo";
/** Explicit "no chain" pick — suppresses the project default even when one is set. */
const CHAIN_NONE = "none";
/** "Follow the project default" marker — the picker's initial state, so a
 *  project with a `defaultChainId` needs no extra click to use it (O-23). */
const CHAIN_DEFAULT = "project-default";

/**
 * `/work/tasks/new` — ZB-04b: a simplified, dedicated create page (not the
 * classify-driven `NewTaskDialog`/`CommandLine`). The **entry** choice is the
 * hard override this deliverable calls for: COO auto-classifies, an explicit
 * department bypasses classification entirely (`TaskTargetSchema`'s
 * `{kind:"department"}`, DNA "explicit target overrides the classifier").
 *
 * ZB-05b / O-23: the **chain** picker follows the same override posture, at a
 * HIGHER priority than the department entry — a chosen chain (explicit, or
 * the selected project's `defaultChainId`) becomes the routing target outright
 * (`{kind:"chain",id}`), same "explicit target overrides the classifier" DNA.
 * v1 order: explicit pick, then the project default, then none.
 */
export function NewTaskScreen() {
  const t = useTranslations("tasksWork");
  const router = useRouter();
  const { data: projects = [] } = useProjectsQuery();
  const { data: chains = [] } = useChainsQuery();

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState("");
  const [entry, setEntry] = useState<string>(ENTRY_COO);
  const [chainId, setChainId] = useState<string>(CHAIN_DEFAULT);
  const [attachmentSet, setAttachmentSet] = useState<{
    attachmentSetId?: string;
    files: Attachment[];
  }>({ files: [] });

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  );

  // O-23 v1 order: explicit pick > the selected project's default > none.
  const effectiveChainId =
    chainId === CHAIN_DEFAULT ? (selectedProject?.defaultChainId ?? null) : chainId;
  const selectedChain =
    effectiveChainId && effectiveChainId !== CHAIN_NONE
      ? chains.find((c) => c.id === effectiveChainId)
      : undefined;
  const paths = useMemo(() => {
    const detected = extractPaths(text);
    return selectedProject?.path ? [...new Set([selectedProject.path, ...detected])] : detected;
  }, [text, selectedProject]);

  const classify = useClassifyTaskMutation();
  useEffect(() => {
    if (entry !== ENTRY_COO || text.trim().length <= 2) return;
    const handle = setTimeout(() => classify.mutate({ body: { text, paths } }), 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- classify is a stable mutation ref
  }, [entry, text, paths]);

  const createTask = useCreateTaskMutation();

  const department = DEPARTMENTS.find((d) => d.id === entry);
  const chosenTarget = selectedChain
    ? { kind: "chain" as const, id: selectedChain.id, name: selectedChain.label }
    : entry !== ENTRY_COO && department
      ? { kind: "department" as const, id: department.id, name: department.name }
      : undefined;
  const previewTarget = chosenTarget
    ? {
        name: selectedChain?.label ?? department?.name ?? entry,
        glyph: selectedChain ? "flow" : department ? "compass" : undefined,
      }
    : classify.data
      ? toClientTarget(classify.data.body.target)
      : null;

  const canSubmit = title.trim().length > 0 && text.trim().length > 0 && !createTask.isPending;

  function submit() {
    if (!canSubmit) return;
    createTask.mutate(
      {
        body: {
          title,
          text,
          paths,
          attachmentSetId: attachmentSet.attachmentSetId,
          target: chosenTarget,
        },
      },
      {
        onSuccess: (res) => router.push(`/work/tasks/${res.body.task.id}` as Route),
      },
    );
  }

  return (
    <Container padding={["300", "350"]}>
      <Stack wrap direction="row" gap="300">
        <Stack gap="200" style={{ flex: "1 1 480px", minWidth: 0 }}>
          <Stack gap="50">
            <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
              {t("eyebrow")}
            </Typography>
            <Typography type="h1">{t("new.title")}</Typography>
          </Stack>

          <TextInputField
            label={t("new.field.title")}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("new.field.titlePlaceholder")}
            value={title}
          />

          <HighlightTextAreaField
            highlights={extractPathRanges(text).map((r) => ({ start: r.start, end: r.end }))}
            label={t("new.field.brief")}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("new.field.briefPlaceholder")}
            rows={6}
            value={text}
          />

          <Stack wrap direction="row" gap="150">
            <SelectField
              label={t("new.field.entry")}
              onValueChange={setEntry}
              options={[
                { value: ENTRY_COO, label: t("new.entry.coo") },
                ...DEPARTMENTS.map((d) => ({ value: d.id, label: d.name })),
              ]}
              value={entry}
            />
            <SelectField
              label={t("new.field.project")}
              onValueChange={setProjectId}
              options={[
                { value: "", label: t("filter.all") },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
              value={projectId}
            />
          </Stack>

          <SelectField
            label={t("new.field.chain")}
            onValueChange={setChainId}
            options={[
              { value: CHAIN_NONE, label: t("new.chain.none") },
              ...(selectedProject?.defaultChainId
                ? [
                    {
                      value: CHAIN_DEFAULT,
                      label: t("new.chain.projectDefault", {
                        label:
                          chains.find((c) => c.id === selectedProject.defaultChainId)?.label ??
                          selectedProject.defaultChainId,
                      }),
                    },
                  ]
                : []),
              ...chains.map((c) => ({ value: c.id, label: c.label })),
            ]}
            value={
              chainId === CHAIN_DEFAULT && !selectedProject?.defaultChainId ? CHAIN_NONE : chainId
            }
          />

          <TaskAttachments onChange={setAttachmentSet} value={attachmentSet} />

          <Stack direction="row" gap="100">
            <Button intent="ghost" onClick={() => router.push("/work/tasks" as Route)}>
              {t("new.cancel")}
            </Button>
            <Button
              disabled={!canSubmit}
              intent="primary"
              loading={createTask.isPending}
              onClick={submit}
            >
              {t("new.submit")}
            </Button>
          </Stack>
        </Stack>

        <Panel header={t("new.routePreviewHeader")} style={{ flex: "0 1 340px", minWidth: 280 }}>
          <Stack gap="150">
            <Stack align="center" direction="row" gap="100">
              <IconTile glyph="compass" size="md" />
              <Typography size="sm" type="text">
                {previewTarget
                  ? t("new.routeSuggest", { target: previewTarget.name })
                  : t("new.routeIdle")}
              </Typography>
            </Stack>
            {selectedChain ? (
              <ChainRouteStrip
                gates={chainRouteGates(selectedChain)}
                size="compact"
                steps={chainRouteSteps(selectedChain)}
              />
            ) : (
              chosenTarget &&
              department && (
                <ChainRouteStrip
                  size="compact"
                  steps={[{ code: department.code, name: department.name, state: "thinking" }]}
                />
              )
            )}
          </Stack>
        </Panel>
      </Stack>
    </Container>
  );
}
