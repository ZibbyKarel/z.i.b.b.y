/* eslint-disable react/forbid-dom-props -- Each transcript line fades by depth
   (computed opacity) and the newest re-keys to replay its enter animation; both
   are per-line dynamic values with no DS prop equivalent. */
import { Typography } from "@zibby/design-system";

export interface VoiceMessage {
  role: "user" | "zibby";
  text: string;
}

export interface VoiceTranscriptProps {
  messages: VoiceMessage[];
  /** Speaker labels (localised): the user tag and the ZIBBY tag. */
  userTag: string;
  zibbyTag: string;
}

/** The last three exchanges, centred above the orb, fading back with depth. */
export function VoiceTranscript({ messages, userTag, zibbyTag }: VoiceTranscriptProps) {
  const shown = messages.slice(-3);
  return (
    <div className="flex min-h-[52px] max-w-[540px] flex-col gap-[7px] text-center">
      {shown.map((m, i) => {
        const isZibby = m.role === "zibby";
        const isLatest = i === shown.length - 1;
        return (
          <div
            key={i}
            style={{
              fontSize: isZibby ? 13.5 : 12,
              lineHeight: 1.56,
              opacity: 0.28 + ((i + 1) / shown.length) * 0.72,
              animation: isLatest ? "v-fade-up 0.4s ease-out" : "none",
            }}
          >
            <Typography
              mono
              as="span"
              size="2xs"
              style={{ marginRight: 8, letterSpacing: "0.12em" }}
              tone={isZibby ? "accent" : undefined}
              type="note"
              variant={isZibby ? undefined : "tertiary"}
            >
              {isZibby ? zibbyTag : userTag}
            </Typography>
            <span
              style={{ color: isZibby ? "var(--color-foreground)" : "var(--color-foreground-dim)" }}
            >
              {m.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
