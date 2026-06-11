import { Button, Container, IconTile, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { TaskTarget } from "../task";

export interface DispatchedStateProps {
  target: TaskTarget;
  onClose: () => void;
}

/**
 * Terminal confirmation: the task has been handed to the chosen target. Glowing
 * tile + the destination name, with a handoff link to the live run list.
 */
export function DispatchedState({ target, onClose }: DispatchedStateProps) {
  const t = useTranslations("tasks.dispatched");
  return (
    <Container padding={["200", "100"]} textAlign="center">
      <Stack align="center" gap="150">
        <IconTile glow filled={false} glyph="bolt" shape="circle" size="xl" />
        <Typography size="xl" type="subtitle" weight="semibold">
          {t("title")}
        </Typography>
        <Typography mono size="base" type="note" variant="secondary">
          {t("detail", { name: target.name })}
        </Typography>
        <Stack align="center" direction="row" gap="100">
          <Link href="/runs?filter=running" onClick={onClose}>
            <Button icon="pulse" intent="primary">
              {t("watch")}
            </Button>
          </Link>
          <Button icon="x" intent="ghost" onClick={onClose}>
            {t("close")}
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}
