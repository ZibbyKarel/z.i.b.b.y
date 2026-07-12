import { useTranslations } from "next-intl";
import { Stack, StatusDot, Typography } from "@zibby/design-system";

export enum VoiceStatusStripTestId {
  Root = "chat-voice-strip",
  Interim = "chat-voice-interim",
}

export interface VoiceStatusStripProps {
  /** Whether the mic is live right now (pulses the dot). */
  listening: boolean;
  /** In-progress transcript — ghost text while the operator speaks. */
  interim: string;
}

/**
 * The voice-mode status strip (Phase 119a) — a listening indicator plus the
 * live interim transcript, rendered above the composer (never inside
 * `CommandLine`; a final utterance is sent directly, Decision 1). ChatScreen
 * mounts this only while voice mode is on.
 */
export function VoiceStatusStrip({ listening, interim }: VoiceStatusStripProps) {
  const t = useTranslations("chat");
  const hasInterim = interim.trim().length > 0;

  return (
    <Stack align="center" data-testid={VoiceStatusStripTestId.Root} direction="row" gap="100">
      <StatusDot pulse={listening} tone={listening ? "accent" : "wait"} />
      <Typography mono size="xs" tone="accent" tracking="widest" type="note">
        {listening ? t("voice.listening") : t("voice.paused")}
      </Typography>
      {hasInterim && (
        <Typography
          data-testid={VoiceStatusStripTestId.Interim}
          size="sm"
          type="text"
          variant="secondary"
        >
          {interim}
        </Typography>
      )}
    </Stack>
  );
}
