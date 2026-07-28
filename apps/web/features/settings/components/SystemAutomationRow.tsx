import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  Card,
  Container,
  Divider,
  Icon,
  Stack,
  Toggle,
  Typography,
} from "@zibby/design-system";
import type { Automation } from "@zibby/contracts";
import { nextCronRun, relativeLabel } from "../../automations/schedule";
import { useCronLabel } from "../../automations/useCronLabel";

/** Testids for a system-automation row (settings' AutomationsSection selects via these). */
export enum SystemAutomationRowTestId {
  Root = "system-automation-row",
  Toggle = "system-automation-row-toggle",
  Edit = "system-automation-row-edit",
  Run = "system-automation-row-run",
  Description = "system-automation-row-desc",
}

export interface SystemAutomationRowProps {
  automation: Automation;
  onToggle: () => void;
  onEdit: () => void;
  onTrigger: () => void;
  triggering?: boolean;
  /** One-line explanation of what this system automation does, keyed by `target.type`. */
  description?: string;
}

/**
 * A system automation reduced to what's actually useful: name → schedule on
 * one line, last/next run + edit/run-now in the footer. Unlike {@link AutomationCard}
 * it skips the trigger/target tiles and the "Systémová" tag — every automation on
 * this list is already a system automation (Settings → Automations is the only
 * place they're shown), and the target duplicated the name in practice (e.g.
 * "Noční extrakce vzorů" → target "Extrakce vzorů").
 */
export function SystemAutomationRow({
  automation,
  onToggle,
  onEdit,
  onTrigger,
  triggering,
  description,
}: SystemAutomationRowProps) {
  const t = useTranslations("automations");
  const locale = useLocale();
  const cronLabel = useCronLabel();
  const { trigger, enabled } = automation;
  const name = automation.name ?? automation.id;

  const scheduleText =
    trigger.type === "cron" ? cronLabel(trigger.expr) : trigger.events.join(", ");

  const next = useMemo(
    () => (trigger.type === "cron" ? nextCronRun(trigger.expr, new Date()) : null),
    [trigger],
  );

  // Captured once at mount — these labels are coarse (minutes/hours) and the
  // row is short-lived, so freezing "now" avoids an impure render-time read.
  const [now] = useState(() => Date.now());
  const lastLabel = automation.lastFiredAt
    ? t("lastRun", { ago: relativeLabel(Date.parse(automation.lastFiredAt), now, locale) })
    : t("neverRun");
  const nextLabel = !enabled
    ? t("nextOff")
    : trigger.type === "event"
      ? t("onEvent")
      : next
        ? t("nextRun", { when: relativeLabel(next.getTime(), now, locale) })
        : "—";

  return (
    <Card background="surface" data-testid={SystemAutomationRowTestId.Root}>
      <Container padding="200">
        <Stack gap="150">
          <Stack align="center" direction="row" gap="150" justify="between">
            <Container grow minW0>
              <Stack align="center" direction="row" gap="100">
                <Typography truncate size="base" type="note" weight="semibold">
                  {name}
                </Typography>
                <Icon name="arrow" size="sm" tone="faint" />
                <Typography mono truncate size="caption" type="note" variant="secondary">
                  {scheduleText}
                </Typography>
              </Stack>
            </Container>
            <Toggle
              checked={enabled}
              data-testid={SystemAutomationRowTestId.Toggle}
              label={t("toggleLabel", { name })}
              onChange={onToggle}
              size="sm"
            />
          </Stack>

          {description ? (
            <Typography
              data-testid={SystemAutomationRowTestId.Description}
              leading="snug"
              size="caption"
              type="note"
              variant="secondary"
            >
              {description}
            </Typography>
          ) : null}

          <Divider />

          <Stack wrap align="center" direction="row" gap="150" justify="between">
            <Stack wrap align="center" direction="row" gap="150">
              <Typography mono size="2xs" type="micro" variant="tertiary">
                {lastLabel}
              </Typography>
              <Typography mono size="2xs" type="micro" variant="tertiary">
                {nextLabel}
              </Typography>
            </Stack>
            <Stack align="center" direction="row" gap="100">
              <Button
                data-testid={SystemAutomationRowTestId.Edit}
                icon="edit"
                intent="ghost"
                onClick={onEdit}
                size="sm"
              >
                {t("edit")}
              </Button>
              <Button
                data-testid={SystemAutomationRowTestId.Run}
                icon="play"
                intent="primary"
                loading={triggering}
                onClick={onTrigger}
                size="sm"
              >
                {t("runNow")}
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
