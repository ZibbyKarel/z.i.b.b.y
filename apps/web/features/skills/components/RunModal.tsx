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
      actions={
        launched ? undefined : (
          <Stack grow align="center" direction="row" justify="between">
            <Button icon="edit" intent="ghost">
              Edit raw SKILL.md
            </Button>
            <Button icon="play" intent="run" onClick={launch}>
              Spustit agenta
            </Button>
          </Stack>
        )
      }
      ariaLabel={`Spustit ${skill.name}`}
      closeLabel="Zavřít"
      onClose={onClose}
      title={
        <Stack align="center" direction="row" gap="150">
          <IconTile glyph={skill.glyph} size="md" />
          <Container grow minW0>
            <Typography mono size="xl" type="note" weight="bold">
              {skill.name}
            </Typography>
            <Typography size="base" type="note" variant="secondary">
              {skill.desc}
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
              Agent spuštěn na pozadí
            </Typography>
            <Typography mono size="base" type="note" variant="secondary">
              {skill.name} → {project}
            </Typography>
            <Typography size="md" type="note" variant="secondary">
              Sleduj ho v sekci{" "}
              <Typography as="span" size="md" tone="accent" type="note">
                Běžící agenti
              </Typography>
              .
            </Typography>
            <Button icon="pulse" intent="ghost" onClick={onClose}>
              Zavřít
            </Button>
          </Stack>
        </Container>
      ) : (
        <Stack gap="200">
          <TextAreaField
            autoFocus
            label="Zadání / prompt"
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`Řekni ${skill.name}, co má udělat…`}
            value={prompt}
          />
          <SegmentedField
            label="Cílový projekt"
            onValueChange={setProject}
            options={projects.map((p) => ({ value: p, label: p }))}
            value={project}
          />
          <Card background="background" radius="sm">
            <Container padding={["150", "150"]}>
              <Stack align="center" direction="row" gap="100">
                <Icon name="file" size="sm" tone="faint" />
                <Typography mono size="caption" type="note" variant="tertiary">
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
