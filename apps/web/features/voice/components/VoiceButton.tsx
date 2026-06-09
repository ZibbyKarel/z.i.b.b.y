"use client";

import { useTranslations } from "next-intl";
import { useVoice } from "../VoiceContext";
import { formatShortcutParts } from "../shortcut";

/**
 * Top-bar entry point to the voice interface. A quiet mono "VOICE" action that
 * opens the takeover; its tooltip advertises the live (rebindable) shortcut.
 */
export function VoiceButton() {
  const t = useTranslations("topbar");
  const { open, shortcut } = useVoice();
  const combo = formatShortcutParts(shortcut).join(" ");

  return (
    <button
      aria-label={t("voiceLabel")}
      className="inline-flex cursor-pointer items-center gap-[7px] rounded-sm border border-border bg-transparent px-[13px] py-[7px] font-mono text-xs font-semibold tracking-[0.06em] text-foreground-dim transition-all hover:border-accent hover:bg-accent-dim hover:text-accent"
      onClick={open}
      title={`${t("voiceTitle")} (${combo})`}
      type="button"
    >
      <svg
        aria-hidden="true"
        fill="none"
        height={14}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
        width={14}
      >
        <rect height="12" rx="3" width="6" x="9" y="2" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
        <path d="M12 19v3M8 22h8" />
      </svg>
      {t("voice")}
    </button>
  );
}
