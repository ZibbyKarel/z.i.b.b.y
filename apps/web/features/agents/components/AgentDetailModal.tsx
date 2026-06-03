"use client";

import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Chip,
  Container,
  Dialog,
  Icon,
  type IconName,
  IconTile,
  MarkdownEditor,
  Pressable,
  SegmentedField,
  Stack,
  TextField,
  Typography,
} from "@zibby/design-system";
import type { Agent, AgentModel, AgentThinking, Category } from "@zibby/contracts";
import type { Pipeline } from "../../../domain";
import { AGENT_GLYPHS, AGENT_TOOLS, MODEL_OPTIONS, THINKING_OPTIONS } from "../../../state/config";
import { agentFile } from "../agentDraft";
import { ModelBadge, ThinkBadge } from "../../pipelines/components/PhaseChain";

export interface AgentDetailModalProps {
  agent: Agent;
  /** "new" opens straight into the editor; "view" shows the read-only detail. */
  mode: "view" | "new";
  /** Live category taxonomy offered in the editor's category picker. */
  categories: Category[];
  pipelines: Pipeline[];
  onClose: () => void;
  onSave: (agent: Agent, isNew: boolean) => void;
  onDelete: (id: string) => void;
  onRun: (agent: Agent) => void;
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
  onRun,
}: AgentDetailModalProps) {
  const t = useTranslations("agents");
  const tk = useTranslations();
  const isNew = initialMode === "new";
  const [mode, setMode] = useState<"view" | "edit">(isNew ? "edit" : "view");
  const [draft, setDraft] = useState<Agent>(agent);
  const [confirm, setConfirm] = useState(false);

  const name = agent.name ?? agent.id;
  const usedBy = pipelines.filter((p) => p.phases.some((ph) => ph.agent === agent.name));

  const set = (patch: Partial<Agent>) => setDraft((d) => ({ ...d, ...patch }));
  const tools = draft.tools ?? [];
  const toggleTool = (tool: string) =>
    set({
      tools: tools.includes(tool) ? tools.filter((x) => x !== tool) : [...tools, tool],
    });

  const editing = mode === "edit" || isNew;
  // A name and a non-empty Markdown body are both required: the body is sent
  // verbatim as the contract's `instructions` (min(1)), never synthesised.
  const canSave = (draft.name ?? "").trim().length > 0 && draft.instructions.trim().length > 0;

  const title = (
    <Stack align="center" direction="row" gap="150">
      <IconTile glyph={(draft.glyph as IconName | undefined) ?? "bot"} size="md" />
      <Container grow minW0>
        <Typography mono truncate size="xl" type="note" weight="bold">
          {isNew ? t("newAgent") : name}
        </Typography>
        {draft.category && <Chip tone="neutral">{draft.category}</Chip>}
      </Container>
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
        ariaLabel={isNew ? t("newAgent") : name}
        closeLabel={tk("common.close")}
        onClose={onClose}
        open={!confirm}
        title={title}
        width={editing ? "2xl" : "lg"}
      >
        {editing ? (
          <Stack align="start" direction="row" gap="300">
            {/* Left column — structured config assembled into YAML frontmatter
                by the backend. The editor on the right never sees these. */}
            <Container grow minW0>
              <Stack gap="200">
                <TextField
                  autoFocus
                  label={t("fields.name")}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder={t("fields.namePlaceholder")}
                  value={draft.name ?? ""}
                />

                <TextField
                  label={t("fields.whenToUse")}
                  onChange={(e) => set({ description: e.target.value })}
                  placeholder={t("fields.whenToUsePlaceholder")}
                  value={draft.description ?? ""}
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
                      onValueChange={(v) => set({ model: v as AgentModel })}
                      options={MODEL_OPTIONS}
                      value={draft.model ?? "sonnet"}
                    />
                  </Container>
                  <Container grow minW0>
                    <SegmentedField
                      label={t("fields.thinking")}
                      onValueChange={(v) => set({ thinking: v as AgentThinking })}
                      options={THINKING_OPTIONS}
                      value={draft.thinking ?? "medium"}
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
                      <ChipToggle active={tools.includes(tool)} key={tool} onClick={() => toggleTool(tool)}>
                        {tool}
                      </ChipToggle>
                    ))}
                  </Stack>
                </Stack>
              </Stack>
            </Container>

            {/* Right column — the Markdown body only. Frontmatter is hidden:
                it is composed from the left-column fields by the API. */}
            <Container grow minW0>
              <MarkdownEditor
                hint={t("fields.bodyHint")}
                label={t("fields.body")}
                onChange={(value) => set({ instructions: value })}
                placeholder={t("fields.bodyPlaceholder")}
                value={draft.instructions}
              />
            </Container>
          </Stack>
        ) : (
          <Stack gap="200">
            <Typography leading="relaxed" size="base" type="note">
              {agent.description}.
            </Typography>

            <Card background="background" radius="sm">
              <Container padding={["150", "150"]}>
                <Stack wrap align="center" direction="row" gap="150">
                  <ModelBadge model={agent.model ?? "sonnet"} />
                  <ThinkBadge level={agent.thinking ?? "medium"} />
                </Stack>
              </Container>
            </Card>

            <Stack gap="75">
              <Typography mono size="sm" type="note" variant="secondary">
                {t("allowedTools")}
              </Typography>
              <Stack wrap direction="row" gap="75">
                {(agent.tools ?? []).map((tool) => (
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
                    {agent.instructions}
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
            {t("deleteBody", { name, file: agentFile(agent.id) })}
          </Typography>
        </Dialog>
      )}
    </>
  );
}
