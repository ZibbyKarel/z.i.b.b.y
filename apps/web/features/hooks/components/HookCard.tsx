import { useTranslations } from "next-intl";
import { Button, Container, Stack, StatusDot, Tag, Typography } from "@zibby/design-system";
import type { Hook } from "@zibby/contracts";
import { HudCard } from "../../../components/HudCard/HudCard";

export interface HookCardProps {
  hook: Hook;
  onConfigure?: (hook: Hook) => void;
}

/**
 * Catalog card for a single hook: a thin container over the generic
 * {@link HudCard}. The aside chip shows the lifecycle event + enabled state, the
 * footer shows the shell command, and the action opens the editor.
 */
export function HookCard({ hook, onConfigure }: HookCardProps) {
  const t = useTranslations();
  const name = hook.name ?? hook.id;
  const detail = hook.matcher ? `${hook.event} · ${hook.matcher}` : hook.event;

  return (
    <HudCard
      actions={
        <Stack align="center" direction="row" justify="between">
          <Container minW0 maxWidth="220px">
            <Typography mono truncate size="xs" type="note" variant="tertiary">
              {hook.command}
            </Typography>
          </Container>
          <Button icon="gear" intent="ghost" onClick={() => onConfigure?.(hook)} size="sm">
            {t("common.configure")}
          </Button>
        </Stack>
      }
      aside={
        <Tag tone={hook.enabled ? "accent" : "neutral"}>
          <StatusDot size="75" tone={hook.enabled ? "ok" : "idle"} />
          {hook.enabled ? t("hooks.enabledShort") : t("hooks.disabledShort")}
        </Tag>
      }
      description={hook.desc ?? detail}
      glyph="checkpoint"
      title={name}
    />
  );
}
