import { useTranslations } from "next-intl";
import { Button, VoiceBars } from "@zibby/design-system";

export enum VoiceToggleButtonTestId {
  Root = "chat-voice-toggle",
}

export interface VoiceToggleButtonProps {
  /** Whether voice mode is currently on (shows the listening bars). */
  active: boolean;
  onToggle: () => void;
}

/**
 * The voice-mode switch (Phase 119a). A quiet icon {@link Button} — the mic glyph
 * when off, the animated listening {@link VoiceBars} while on. ChatScreen/the dock
 * render it ONLY when STT is supported (an unlabeled dead control would break the
 * interaction grammar), so there is no disabled state here.
 */
export function VoiceToggleButton({ active, onToggle }: VoiceToggleButtonProps) {
  const t = useTranslations("chat");
  const label = t(active ? "voice.stop" : "voice.start");

  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      data-testid={VoiceToggleButtonTestId.Root}
      icon={active ? undefined : "mic"}
      intent="ghost"
      onClick={onToggle}
      size="sm"
      title={label}
    >
      {active && <VoiceBars />}
    </Button>
  );
}
