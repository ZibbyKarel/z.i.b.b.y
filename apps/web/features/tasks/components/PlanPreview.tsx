import { Container, IconTile, Stack, Tag, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type TaskRouting, isLowConfidence } from "../task";

export interface PlanPreviewProps {
  routing: TaskRouting;
}

/**
 * The compact "ZIBBY will…" preview the unified composer renders from the live
 * classify verdict (Phase 11.2) — the mode is shown, never chosen. A `single`
 * verdict reads as one dispatch to the routed target; a `loop` verdict reads as a
 * synthesized goal (maker · project-checks verifier · iteration cap). The advanced
 * controls live behind the "Edit" disclosure; this is read-only signal.
 */
export function PlanPreview({ routing }: PlanPreviewProps) {
  const t = useTranslations("tasks.preview");
  const { mode, target, proposedGoal, reason, confidence, ambiguous, runnerUp } = routing;

  if (mode === "loop" && proposedGoal) {
    const makerName =
      routing.candidates.find(
        (c) => c.kind === proposedGoal.maker.kind && "id" in c && c.id === proposedGoal.maker.id,
      )?.name ?? proposedGoal.maker.id;
    return (
      <Container>
        <Stack align="center" direction="row" gap="150">
          <IconTile glyph="retry" size="md" tone="accent" />
          <Container grow minW0>
            <Typography mono size="sm" type="note" weight="bold">
              {t("loopSummary", {
                maker: makerName,
                n: proposedGoal.maxIterations,
              })}
            </Typography>
            <Typography size="sm" type="note" variant="secondary">
              {reason}
            </Typography>
          </Container>
        </Stack>
      </Container>
    );
  }

  return (
    <Container>
      <Stack align="center" direction="row" gap="150">
        <IconTile glyph={target.glyph} size="md" />
        <Container grow minW0>
          <Stack align="center" direction="row" gap="100">
            <Typography mono size="sm" type="note" weight="bold">
              {t("single", { target: target.name })}
            </Typography>
            {/* NS2 F10 — `ambiguous` REPLACES the low-confidence tag rather than
                stacking with it: it is the same doubt stated more precisely (the
                classifier weighed two options and couldn't separate them), and two
                warn tags side by side would read as two separate problems. */}
            {ambiguous ? (
              <Tag size="sm" tone="warn">
                {t("ambiguous")}
              </Tag>
            ) : (
              isLowConfidence(confidence) && (
                <Tag size="sm" tone="warn">
                  {t("lowConfidence")}
                </Tag>
              )
            )}
          </Stack>
          <Typography size="sm" type="note" variant="secondary">
            {reason}
          </Typography>
          {/* The actionable half of the doubt: name the runner-up so the operator can
              act on the real choice, and point at the manual picker. Two phrasings,
              because "these two are tied" and "nothing fits" are different questions. */}
          {ambiguous && (
            <Typography size="sm" type="note" variant="secondary">
              {runnerUp
                ? t("ambiguousBetween", {
                    first: target.name,
                    second: runnerUp.target.name,
                  })
                : t("ambiguousWeak")}
            </Typography>
          )}
        </Container>
      </Stack>
    </Container>
  );
}
