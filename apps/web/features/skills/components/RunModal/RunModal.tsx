"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Container,
  Dialog,
  Icon,
  IconTile,
  SegmentedField,
  Stack,
  TextAreaField,
  Typography,
} from "@zibby/design-system";
import type { IconName } from "@zibby/design-system";
import type { Agent } from "@zibby/contracts";

export interface RunModalProps {
  /** Agent to run; the modal renders only when set. The contract `Agent` is the
   * single shape used end to end — no bespoke run-target type to map through. */
  agent: Agent;
  /** Display-only backing file path (`agentFile(id)` for agents, the SKILL.md path
   * for the not-yet-contracted skills placeholder). */
  file: string;
  /** Selectable target projects (from projects.json). */
  projects: string[];
  onClose: () => void;
  /** Called with the composed run request when the user launches. */
  onLaunch?: (req: { agent: Agent; prompt: string; project: string }) => void;
}

/**
 * The recurring dashboard interaction: write a prompt, pick a target project, see
 * the backing SKILL.md path, then launch a background agent. Mounted only when
 * a skill is selected (mount with a `key` to reset state per skill).
 */
export function RunModal({ agent, file, projects, onClose, onLaunch }: RunModalProps) {
  const t = useTranslations();
  const [prompt, setPrompt] = useState("");
  const [project, setProject] = useState(projects[0] ?? "");
  const [launched, setLaunched] = useState(false);

  const name = agent.name ?? agent.id;
  const desc = agent.description ?? "";
  const glyph = (agent.glyph as IconName | undefined) ?? "bot";

  function launch() {
    onLaunch?.({ agent, prompt, project });
    setLaunched(true);
  }

  return (
    <Dialog
      open
      actions={
        launched ? undefined : (
          <Stack grow align="center" direction="row" justify="between">
            <Button icon="edit" intent="ghost">
              {t("runModal.editRaw")}
            </Button>
            <Button icon="play" intent="run" onClick={launch}>
              {t("runModal.launch")}
            </Button>
          </Stack>
        )
      }
      ariaLabel={t("runModal.runAria", { name })}
      closeLabel={t("common.close")}
      onClose={onClose}
      title={
        <Stack align="center" direction="row" gap="150">
          <IconTile glyph={glyph} size="md" />
          <Container grow minW0>
            <Typography mono size="xl" type="note" weight="bold">
              {name}
            </Typography>
            <Typography size="base" type="note" variant="secondary">
              {desc}
            </Typography>
          </Container>
        </Stack>
      }
      width="lg"
    >
      {launched ? (
        <Container padding={["200", "100"]} textAlign="center">
          <Stack align="center" gap="100">
            <IconTile glow filled={false} glyph="play" shape="circle" size="xl" />
            <Typography size="xl" type="subtitle" weight="semibold">
              {t("runModal.launchedTitle")}
            </Typography>
            <Typography mono size="base" type="note" variant="secondary">
              {t("runModal.launchedTarget", { name, project })}
            </Typography>
            <Typography size="md" type="note" variant="secondary">
              {t.rich("runModal.watch", {
                agents: (chunks) => (
                  <Typography as="span" size="md" tone="accent" type="note">
                    {chunks}
                  </Typography>
                ),
              })}
            </Typography>
            <Button icon="pulse" intent="ghost" onClick={onClose}>
              {t("common.close")}
            </Button>
          </Stack>
        </Container>
      ) : (
        <Stack gap="200">
          <TextAreaField
            autoFocus
            label={t("runModal.promptLabel")}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("runModal.promptPlaceholder", { name })}
            value={prompt}
          />
          <SegmentedField
            label={t("common.targetProject")}
            onValueChange={setProject}
            options={projects.map((p) => ({ value: p, label: p }))}
            value={project}
          />
          <Card background="background" radius="sm">
            <Container padding={["150", "150"]}>
              <Stack align="center" direction="row" gap="100">
                <Icon name="file" size="sm" tone="faint" />
                <Typography mono size="caption" type="note" variant="tertiary">
                  {file}
                </Typography>
              </Stack>
            </Container>
          </Card>
        </Stack>
      )}
    </Dialog>
  );
}
