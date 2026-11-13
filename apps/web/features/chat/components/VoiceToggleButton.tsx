import { useTranslations } from "next-intl";
import { Button, VoiceBars } from "@zibby/design-system";

export enum VoiceToggleButtonTestId {
  Root = "chat-voice-toggle",
}

export interface VoiceToggleButtonProps {
  /** Whether voice mode is currently on (shows the listening bars). */
  active: boolean;
  onToggle: () => void;
  /** Larger labelled variant (secondary when off, primary when on) for dictation-first surfaces. */
  prominent?: boolean;
}

/**
 * The voice-mode switch (Phase 119a). A quiet icon {@link Button} — the mic glyph
 * when off, the animated listening {@link VoiceBars} while on. ChatScreen/the dock
 * render it ONLY when STT is supported (an unlabeled dead control would break the
 * interaction grammar), so there is no disabled state here.
 */
export function VoiceToggleButton({ active, onToggle, prominent = false }: VoiceToggleButtonProps) {
  const t = useTranslations("chat");
  const label = t(active ? "voice.stop" : "voice.start");

  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      data-testid={VoiceToggleButtonTestId.Root}
      icon={active ? undefined : "mic"}
      intent={prominent ? (active ? "primary" : "secondary") : "ghost"}
      onClick={onToggle}
      size={prominent ? "md" : "sm"}
      title={label}
    >
      {active && <VoiceBars />}
      {prominent && label}
    </Button>
  );
}
