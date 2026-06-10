import {
  Button,
  Card,
  Chip,
  Container,
  Divider,
  IconTile,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type TaskRouting, type TaskTarget, isLowConfidence } from "../task";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { PathChips } from "./PathChips";
import { TargetPicker } from "./TargetPicker";

export interface RoutingResultProps {
  routing: TaskRouting;
  /** Currently selected destination (auto or manually overridden). */
  selectedTarget: TaskTarget;
  /** Whether the manual override picker is expanded. */
  overrideOpen: boolean;
  /** File/folder paths carried as task context. */
  paths: string[];
  onToggleOverride: () => void;
  onPick: (target: TaskTarget) => void;
}

const sameTarget = (a: TaskTarget, b: TaskTarget) => a.kind === b.kind && a.id === b.id;

/**
 * The approval gate. Shows where ZIBBY proposes to send the task — target,
 * visual confidence, the matched-term rationale and the context paths — and lets
 * the user override the destination. The actual trigger (`Dispatch`) lives in
 * the dialog footer, so nothing runs from this view alone.
 */
export function RoutingResult({
  routing,
  selectedTarget,
  overrideOpen,
  paths,
  onToggleOverride,
  onPick,
}: RoutingResultProps) {
  const t = useTranslations("tasks.routing");
  const overridden = !sameTarget(selectedTarget, routing.target);
  const low = isLowConfidence(routing.confidence);
  // Only the original auto-suggestion warrants the warn treatment; once the user
  // has manually chosen a target the low-confidence framing no longer applies.
  const warnTone = low && !overridden;

  return (
    <Stack gap="200">
      <Card
        corners
        background="panel"
        radius="sm"
        tone={overridden ? "accent" : warnTone ? "warn" : "accent"}
      >
        <Container padding="200">
          <Stack gap="150">
            <Stack align="center" direction="row" gap="100">
              <Typography mono size="2xs" tracking="wide" type="note" variant="tertiary">
                {t("title")}
              </Typography>
              {overridden && (
                <Chip size="sm" tone="accent">
                  {t("manual")}
                </Chip>
              )}
            </Stack>

            <Stack align="center" direction="row" gap="150">
              <IconTile glow={!warnTone} glyph={selectedTarget.glyph} size="lg" />
              <Container grow minW0>
                <Stack align="center" direction="row" gap="100">
                  <Typography mono truncate size="xl" type="note" weight="bold">
                    {selectedTarget.name}
                  </Typography>
                  <Chip size="sm" tone="neutral">
                    {t(`targetKind.${selectedTarget.kind}`)}
                  </Chip>
                </Stack>
                {selectedTarget.category && (
                  <Typography truncate size="sm" type="note" variant="secondary">
                    {selectedTarget.category}
                  </Typography>
                )}
              </Container>
            </Stack>

            {overridden ? null : <ConfidenceMeter confidence={routing.confidence} />}

            <Typography size="base" type="note" variant="secondary">
              {routing.matchedTerms.length > 0
                ? t("reason", { terms: routing.matchedTerms.join(", ") })
                : t("reasonNone")}
            </Typography>

            {warnTone && (
              <Typography mono size="sm" tone="warn" type="note">
                {t("reasonLow")}
              </Typography>
            )}
          </Stack>
        </Container>
      </Card>

      {paths.length > 0 && (
        <Stack gap="75">
          <Typography mono size="2xs" tracking="wide" type="note" variant="tertiary">
            {t("pathsTitle")}
          </Typography>
          <PathChips paths={paths} />
        </Stack>
      )}

      <Stack gap="150">
        <Stack align="center" direction="row" justify="between">
          <Button
            icon={overrideOpen ? "chevron" : "edit"}
            intent="ghost"
            onClick={onToggleOverride}
            size="sm"
          >
            {overrideOpen ? t("overrideClose") : t("override")}
          </Button>
        </Stack>

        {overrideOpen && (
          <>
            <Divider />
            <Typography mono size="2xs" tracking="wide" type="note" variant="tertiary">
              {t("overrideTitle")}
            </Typography>
            <TargetPicker
              candidates={routing.candidates}
              onPick={onPick}
              selected={selectedTarget}
            />
          </>
        )}
      </Stack>
    </Stack>
  );
}
