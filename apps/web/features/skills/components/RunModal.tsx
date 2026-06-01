"use client";
import { useState } from "react";
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
import type { Skill } from "../../../domain";

export interface RunModalProps {
  /** Skill to run; the modal renders only when set. */
  skill: Skill;
  /** Selectable target projects (from projects.json). */
  projects: string[];
  onClose: () => void;
  /** Called with the composed run request when the user launches. */
  onLaunch?: (req: { skill: Skill; prompt: string; project: string }) => void;
}

/**
 * The recurring dashboard interaction: write a prompt, pick a target project, see
 * the backing SKILL.md path, then launch a background agent. Mounted only when
 * a skill is selected (mount with a `key` to reset state per skill).
 */
export function RunModal({ skill, projects, onClose, onLaunch }: RunModalProps) {
  const [prompt, setPrompt] = useState("");
  const [project, setProject] = useState(projects[0] ?? "");
  const [launched, setLaunched] = useState(false);

  function launch() {
    onLaunch?.({ skill, prompt, project });
    setLaunched(true);
  }

  return (
    <Dialog
      open
      width="lg"
      onClose={onClose}
      ariaLabel={`Spustit ${skill.name}`}
      closeLabel="Zavřít"
      title={
        <Stack direction="row" align="center" gap="150">
          <IconTile glyph={skill.glyph} size="md" />
          <Container grow minW0>
            <Typography type="note" mono weight="bold" size="xl">
              {skill.name}
            </Typography>
            <Typography type="note" variant="secondary" size="base">
              {skill.desc}
            </Typography>
          </Container>
        </Stack>
      }
      actions={
        launched ? undefined : (
          <Stack direction="row" align="center" justify="between" grow>
            <Button intent="ghost" icon="edit">
              Edit raw SKILL.md
            </Button>
            <Button intent="run" icon="play" onClick={launch}>
              Spustit agenta
            </Button>
          </Stack>
        )
      }
    >
      {launched ? (
        <Container textAlign="center" padding={["200", "100"]}>
          <Stack align="center" gap="100">
            <IconTile glyph="play" size="xl" shape="circle" filled={false} glow />
            <Typography type="subtitle" size="xl" weight="semibold">
              Agent spuštěn na pozadí
            </Typography>
            <Typography type="note" mono size="base" variant="secondary">
              {skill.name} → {project}
            </Typography>
            <Typography type="note" size="md" variant="secondary">
              Sleduj ho v sekci{" "}
              <Typography as="span" type="note" size="md" tone="accent">
                Běžící agenti
              </Typography>
              .
            </Typography>
            <Button intent="ghost" icon="pulse" onClick={onClose}>
              Zavřít
            </Button>
          </Stack>
        </Container>
      ) : (
        <Stack gap="200">
          <TextAreaField
            label="Zadání / prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            autoFocus
            placeholder={`Řekni ${skill.name}, co má udělat…`}
          />
          <SegmentedField
            label="Cílový projekt"
            value={project}
            options={projects.map((p) => ({ value: p, label: p }))}
            onValueChange={setProject}
          />
          <Card background="background" radius="sm">
            <Container padding={["150", "150"]}>
              <Stack direction="row" align="center" gap="100">
                <Icon name="file" size="sm" tone="faint" />
                <Typography type="note" mono size="caption" variant="tertiary">
                  {skill.file}
                </Typography>
              </Stack>
            </Container>
          </Card>
        </Stack>
      )}
    </Dialog>
  );
}
