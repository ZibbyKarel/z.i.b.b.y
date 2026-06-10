import { Chip, Progress, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type ConfidenceBand, confidenceBand } from "../task";

export interface ConfidenceMeterProps {
  /** 0–1 classifier confidence. */
  confidence: number;
}

const BAND_TONE: Record<ConfidenceBand, "ok" | "accent" | "warn"> = {
  high: "ok",
  medium: "accent",
  low: "warn",
};

/**
 * Visual confidence read-out for a routing verdict: a glowing bar tinted by band
 * (green / accent / amber) plus the band word and percentage in mono — so the
 * strength of the guess is legible at a glance, not just as a number.
 */
export function ConfidenceMeter({ confidence }: ConfidenceMeterProps) {
  const t = useTranslations("tasks.routing");
  const band = confidenceBand(confidence);
  const tone = BAND_TONE[band];
  const pct = Math.round(confidence * 100);

  return (
    <Stack gap="75">
      <Stack align="center" direction="row" justify="between">
        <Typography mono size="2xs" tracking="wide" type="note" variant="tertiary">
          {t("confidenceLabel")}
        </Typography>
        <Stack align="center" direction="row" gap="75">
          <Chip size="sm" tone={tone}>
            {t(`band.${band}`)}
          </Chip>
          <Typography mono size="2xs" type="note" variant="secondary">
            {pct}%
          </Typography>
        </Stack>
      </Stack>
      <Progress glow height="50" label={t("confidenceLabel")} tone={tone} value={pct} />
    </Stack>
  );
}
