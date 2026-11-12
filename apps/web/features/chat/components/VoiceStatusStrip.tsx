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
  /** A recording is being transcribed — replaces the listening label. */
  transcribing?: boolean;
}

/**
 * The voice-mode status strip (Phase 119a) — a listening indicator plus the
 * live interim transcript, rendered above the composer (never inside
 * `CommandLine`; a final utterance is sent directly, Decision 1). ChatScreen
 * mounts this only while voice mode is on.
 */
export function VoiceStatusStrip({
  listening,
  interim,
  transcribing = false,
}: VoiceStatusStripProps) {
  const t = useTranslations("chat");
  const hasInterim = interim.trim().length > 0;

  return (
    <Stack align="center" data-testid={VoiceStatusStripTestId.Root} direction="row" gap="100">
      <StatusDot
        pulse={listening || transcribing}
        tone={listening || transcribing ? "accent" : "wait"}
      />
      <Typography mono size="xs" tone="accent" tracking="widest" type="note">
        {transcribing
          ? t("voice.transcribing")
          : listening
            ? t("voice.listening")
            : t("voice.paused")}
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
