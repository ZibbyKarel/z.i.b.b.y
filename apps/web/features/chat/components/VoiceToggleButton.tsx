import { useTranslations } from "next-intl";
import { Button } from "@zibby/design-system";

export enum VoiceToggleButtonTestId {
  Root = "chat-voice-toggle",
}

export interface VoiceToggleButtonProps {
  /** Whether voice mode is currently on (fills the button). */
  active: boolean;
  onToggle: () => void;
}

/**
 * The top-bar voice-mode switch (Phase 119a). A mic {@link Button} — filled
 * (`primary`) while listening, quiet (`ghost`) when off — that flips voice mode.
 * ChatScreen renders it ONLY when STT is supported (an unlabeled dead control
 * would break the interaction grammar), so there is no disabled state here.
 */
export function VoiceToggleButton({ active, onToggle }: VoiceToggleButtonProps) {
  const t = useTranslations("chat");
  const label = t(active ? "voice.stop" : "voice.start");

  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      data-testid={VoiceToggleButtonTestId.Root}
      icon="mic"
      intent={active ? "primary" : "ghost"}
      onClick={onToggle}
      size="sm"
      title={label}
    />
  );
}
