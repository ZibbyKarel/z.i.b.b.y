"use client";
import type { Agent } from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";
import {
  Button,
  Container,
  Dialog,
  IconTile,
  Stack,
  Typography,
} from "@zibby/design-system";
import { Form, FormTextArea, FormTextInput, zodResolver } from "@zibby/forms";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
import { z } from "zod";

export interface RunModalProps {
  agent: Agent;
  onClose: () => void;
  onLaunch?: (req: {
    agent: Agent;
    prompt: string;
    files: string[];
  }) => void;
}

type RunFormValues = {
  prompt: string;
  /**
   * Absolute path of the directory the agent is granted access to — the run
   * target. The user types (or pastes) it; it must be an absolute path so the
   * API grants the right directory.
   */
  targetDir: string;
};

export function RunModal({ agent, onClose, onLaunch }: RunModalProps) {
  const t = useTranslations();
  const [launched, setLaunched] = useState(false);
  const [launchedTarget, setLaunchedTarget] = useState("");

  const name = agent.name ?? agent.id;
  const desc = agent.description ?? "";
  const glyph = (agent.glyph as IconName | undefined) ?? "bot";

  // The target must be an absolute path: anything else would be rejected by the
  // API and grant nothing, so block launch here and tell the user to complete
  // the path. The Run button is the only confirmation — this is validation.
  const resolver = useMemo(
    () =>
      zodResolver(
        z.object({
          prompt: z.string(),
          targetDir: z
            .string()
            .refine((v) => v.trim().startsWith("/"), {
              message: t("runModal.targetDirError"),
            }),
        }),
      ),
    [t],
  );

  function onFormSubmit(values: RunFormValues) {
    const dir = values.targetDir.trim();
    setLaunchedTarget(dir);
    onLaunch?.({ agent, prompt: values.prompt, files: [dir] });
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
            <Button form="run-form" icon="play" intent="run" type="submit">
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
            <IconTile
              glow
              filled={false}
              glyph="play"
              shape="circle"
              size="xl"
            />
            <Typography size="xl" type="subtitle" weight="semibold">
              {t("runModal.launchedTitle")}
            </Typography>
            <Typography mono size="base" type="note" variant="secondary">
              {t("runModal.launchedTarget", { name, project: launchedTarget })}
            </Typography>
            <Typography size="md" type="note" variant="secondary">
              {t.rich("runModal.watch", {
                agents: (chunks) => (
                  <Link href="/runs?filter=running">
                    <Typography as="span" size="md" tone="accent" type="note">
                      {chunks}
                    </Typography>
                  </Link>
                ),
              })}
            </Typography>
            <Button icon="pulse" intent="ghost" onClick={onClose}>
              {t("common.close")}
            </Button>
          </Stack>
        </Container>
      ) : (
        <Form<RunFormValues>
          formOptions={{
            resolver,
            defaultValues: {
              prompt: "",
              targetDir: "",
            },
          }}
          id="run-form"
          onSubmit={onFormSubmit}
        >
          <Stack gap="200">
            <FormTextArea<RunFormValues>
              autoFocus
              label={t("runModal.promptLabel")}
              name="prompt"
              placeholder={t("runModal.promptPlaceholder", { name })}
            />

            <FormTextInput<RunFormValues>
              hint={t("runModal.targetDirHint")}
              label={t("runModal.targetDirLabel")}
              name="targetDir"
              placeholder="/Users/you/folder"
            />
          </Stack>
        </Form>
      )}
    </Dialog>
  );
}
