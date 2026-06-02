"use client";

import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Chip,
  Container,
  Dialog,
  Divider,
  Icon,
  IconTile,
  Pressable,
  SegmentedField,
  Stack,
  StatusDot,
  TextAreaField,
  TextField,
  Typography,
} from "@zibby/design-system";
import type { Category } from "@zibby/contracts";
import type { ModelName, ThinkingLevel } from "../../../domain";
import type { AgentDef, Pipeline } from "../../../domain";
import { AGENT_GLYPHS, AGENT_TOOLS, MODEL_OPTIONS, THINKING_OPTIONS } from "../../../state/config";
import { ModelBadge, ThinkBadge } from "../../pipelines/components/PhaseChain";

export interface AgentDetailModalProps {
  agent: AgentDef;
  /** "new" opens straight into the editor; "view" shows the read-only detail. */
  mode: "view" | "new";
  /** Live category taxonomy offered in the editor's category picker. */
  categories: Category[];
  pipelines: Pipeline[];
  onClose: () => void;
  onSave: (agent: AgentDef, isNew: boolean) => void;
  onDelete: (id: string) => void;
  onToggleEnabled: (agent: AgentDef) => void;
  onRun: (agent: AgentDef) => void;
}

/** Active/paused/idle pill row used in the view header. */
function ToggleButton({
  paused,
  label,
  onClick,
}: {
  paused: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button icon={paused ? "play" : "pause"} intent={paused ? "solid" : "ghost"} onClick={onClick} size="sm">
      {label}
    </Button>
  );
}

/** A clickable chip used for multi/single select (category, tools). */
function ChipToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable onClick={onClick}>
      <Chip tone={active ? "accent" : "neutral"}>{children}</Chip>
    </Pressable>
  );
}

export function AgentDetailModal({
  agent,
  mode: initialMode,
  categories,
  pipelines,
  onClose,
  onSave,
  onDelete,
  onToggleEnabled,
  onRun,
}: AgentDetailModalProps) {
  const t = useTranslations("agents");
  const tk = useTranslations();
  const isNew = initialMode === "new";
  const [mode, setMode] = useState<"view" | "edit">(isNew ? "edit" : "view");
  const [draft, setDraft] = useState<AgentDef>(agent);
  const [confirm, setConfirm] = useState(false);

  const paused = agent.enabled === false;
  const usedBy = pipelines.filter((p) => p.phases.some((ph) => ph.agent === agent.name));

  const set = (patch: Partial<AgentDef>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleTool = (tool: string) =>
    set({
      tools: draft.tools.includes(tool)
        ? draft.tools.filter((x) => x !== tool)
        : [...draft.tools, tool],
    });

  const editing = mode === "edit" || isNew;
  // A name and a non-empty Markdown body are both required: the body is sent
  // verbatim as the contract's `instructions` (min(1)), never synthesised.
  const canSave = draft.name.trim().length > 0 && (draft.body?.trim().length ?? 0) > 0;

  const title = (
    <Stack align="center" direction="row" gap="150">
      <IconTile glyph={draft.glyph} size="md" />
      <Container grow minW0>
        <Typography mono truncate size="xl" type="note" weight="bold">
          {isNew ? t("newAgent") : agent.name}
        </Typography>
        {draft.category && <Chip tone="neutral">{draft.category}</Chip>}
      </Container>
      {!isNew && mode === "view" && (
        <ToggleButton
          label={paused ? t("paused") : t("active")}
          onClick={() => onToggleEnabled(agent)}
          paused={paused}
        />
      )}
    </Stack>
  );

  const viewActions = (
    <Stack grow align="center" direction="row" justify="between">
      <Button icon="x" intent="reject" onClick={() => setConfirm(true)} size="sm">
        {t("delete")}
      </Button>
      <Stack align="center" direction="row" gap="100">
        <Button icon="edit" intent="ghost" onClick={() => { setDraft(agent); setMode("edit"); }} size="sm">
          {t("edit")}
        </Button>
        <Button icon="play" intent="run" onClick={() => onRun(agent)} size="sm">
          {t("runAdhoc")}
        </Button>
      </Stack>
    </Stack>
  );

  const editActions = (
    <>
      <Button intent="ghost" onClick={() => { if (isNew) onClose(); else { setDraft(agent); setMode("view"); } }}>
        {tk("common.cancel")}
      </Button>
      <Button
        disabled={!canSave}
        icon={isNew ? "plus" : "check"}
        intent="run"
        onClick={() => {
          onSave(draft, isNew);
          if (!isNew) setMode("view");
        }}
      >
        {isNew ? t("create") : t("save")}
      </Button>
    </>
  );

  return (
    <>
      <Dialog
        actions={editing ? editActions : viewActions}
        ariaLabel={isNew ? t("newAgent") : agent.name}
        closeLabel={tk("common.close")}
        onClose={onClose}
        open={!confirm}
        title={title}
        width="lg"
      >
        {editing ? (
          <Stack gap="200">
            <TextField
              autoFocus
              label={t("fields.name")}
              onChange={(e) => set({ name: e.target.value })}
              placeholder={t("fields.namePlaceholder")}
              value={draft.name}
            />

            <TextField
              label={t("fields.whenToUse")}
              onChange={(e) => set({ role: e.target.value })}
              placeholder={t("fields.whenToUsePlaceholder")}
              value={draft.role}
            />

            <Stack gap="75">
              <Typography mono size="sm" type="note" variant="secondary">
                {t("fields.category")}
              </Typography>
              <Stack wrap direction="row" gap="75">
                {categories.map((c) => (
                  <ChipToggle
                    active={draft.category === c.name}
                    key={c.name}
                    onClick={() => set({ category: c.name })}
                  >
                    {c.name}
                  </ChipToggle>
                ))}
              </Stack>
            </Stack>

            <Stack direction="row" gap="150">
              <Container grow minW0>
                <SegmentedField
                  label={t("fields.model")}
                  onValueChange={(v) => set({ model: v as ModelName })}
                  options={MODEL_OPTIONS}
                  value={draft.model}
                />
              </Container>
              <Container grow minW0>
                <SegmentedField
                  label={t("fields.thinking")}
                  onValueChange={(v) => set({ thinking: v as ThinkingLevel })}
                  options={THINKING_OPTIONS}
                  value={draft.thinking}
                />
              </Container>
            </Stack>

            <Stack gap="75">
              <Typography mono size="sm" type="note" variant="secondary">
                {t("fields.icon")}
              </Typography>
              <Stack wrap direction="row" gap="75">
                {AGENT_GLYPHS.map((g) => (
                  <IconTile
                    interactive
                    aria-label={g}
                    aria-pressed={draft.glyph === g}
                    as="button"
                    glyph={g}
                    key={g}
                    onClick={() => set({ glyph: g })}
                    radius="default"
                    size="sm"
                    tone={draft.glyph === g ? "accent" : "neutral"}
                  />
                ))}
              </Stack>
            </Stack>

            <Stack gap="75">
              <Typography mono size="sm" type="note" variant="secondary">
                {t("allowedTools")}
              </Typography>
              <Stack wrap direction="row" gap="75">
                {AGENT_TOOLS.map((tool) => (
                  <ChipToggle active={draft.tools.includes(tool)} key={tool} onClick={() => toggleTool(tool)}>
                    {tool}
                  </ChipToggle>
                ))}
              </Stack>
            </Stack>

            <TextAreaField
              hint={t("fields.bodyHint")}
              label={t("fields.body")}
              onChange={(e) => set({ body: e.target.value })}
              value={draft.body ?? ""}
            />
          </Stack>
        ) : (
          <Stack gap="200">
            <Typography leading="relaxed" size="base" type="note">
              {agent.role}.
            </Typography>

            <Card background="background" radius="sm">
              <Container padding={["150", "150"]}>
                <Stack wrap align="center" direction="row" gap="150">
                  <Stack align="center" direction="row" gap="75">
                    <StatusDot tone={paused ? "warn" : agent.state === "idle" ? "faint" : "accent"} />
                    <Typography mono size="sm" type="note" variant="secondary">
                      {paused ? t("paused") : tk(`agents.state${agent.state === "pipeline" ? "Pipeline" : agent.state === "running" ? "Running" : "Idle"}`)}
                    </Typography>
                  </Stack>
                  <Container height="22px">
                    <Divider orientation="vertical" />
                  </Container>
                  <ModelBadge model={agent.model} />
                  <ThinkBadge level={agent.thinking} />
                  <Container height="22px">
                    <Divider orientation="vertical" />
                  </Container>
                  <Typography mono size="sm" type="note" variant="secondary">
                    {t("runs", { count: agent.runs ?? 0 })}
                  </Typography>
                </Stack>
              </Container>
            </Card>

            <Stack gap="75">
              <Typography mono size="sm" type="note" variant="secondary">
                {t("allowedTools")}
              </Typography>
              <Stack wrap direction="row" gap="75">
                {agent.tools.map((tool) => (
                  <Chip key={tool} tone="neutral">
                    {tool}
                  </Chip>
                ))}
              </Stack>
            </Stack>

            <Stack gap="75">
              <Typography mono size="sm" type="note" variant="secondary">
                {t("usedInPipelines")}
              </Typography>
              {usedBy.length > 0 ? (
                <Stack gap="75">
                  {usedBy.map((p) => (
                    <Card background="background" key={p.id} radius="sm">
                      <Container padding={["100", "150"]}>
                        <Stack align="center" direction="row" gap="100">
                          <Icon name="flow" size="sm" tone="accent" />
                          <Container grow minW0>
                            <Typography mono truncate size="sm" type="note">
                              {p.name}
                            </Typography>
                          </Container>
                          <Typography mono nowrap size="xs" type="note" variant="tertiary">
                            {t("phaseCount", { count: p.phases.length })}
                          </Typography>
                        </Stack>
                      </Container>
                    </Card>
                  ))}
                </Stack>
              ) : (
                <Typography mono size="sm" type="note" variant="tertiary">
                  {t("notInPipeline")}
                </Typography>
              )}
            </Stack>

            <Card background="background" radius="sm">
              <Container padding={["100", "150"]}>
                <Stack align="center" direction="row" gap="100">
                  <Icon name="file" size="sm" tone="faint" />
                  <Typography mono truncate size="xs" type="note" variant="tertiary">
                    {agent.file}
                  </Typography>
                </Stack>
              </Container>
            </Card>

            <Stack gap="75">
              <Typography mono size="sm" type="note" variant="secondary">
                {t("fields.body")}
              </Typography>
              <Card background="background" radius="sm">
                <Container
                  padding="150"
                  style={{ maxHeight: 240, overflow: "auto" }}
                >
                  <Typography
                    mono
                    leading="relaxed"
                    size="caption"
                    style={{ whiteSpace: "pre-wrap" }}
                    type="note"
                    variant="secondary"
                  >
                    {agent.body ?? ""}
                  </Typography>
                </Container>
              </Card>
            </Stack>
          </Stack>
        )}
      </Dialog>

      {confirm && (
        <Dialog
          open
          actions={
            <>
              <Button intent="ghost" onClick={() => setConfirm(false)}>
                {tk("common.cancel")}
              </Button>
              <Button icon="x" intent="reject" onClick={() => { setConfirm(false); onDelete(agent.id); }}>
                {t("delete")}
              </Button>
            </>
          }
          onClose={() => setConfirm(false)}
          title={t("deleteTitle")}
          width="sm"
        >
          <Typography size="base" type="note" variant="secondary">
            {t("deleteBody", { name: agent.name, file: agent.file })}
          </Typography>
        </Dialog>
      )}
    </>
  );
}
