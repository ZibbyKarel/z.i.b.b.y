"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Kbd, Stack, cn } from "@zibby/design-system";
import {
  DEFAULT_VOICE_SHORTCUT,
  SHORTCUT_BLOCKED,
  type VoiceShortcut,
  formatShortcutParts,
  isDefaultShortcut,
  isModifierKey,
  shortcutFromEvent,
} from "../shortcut";

export interface ShortcutCaptureProps {
  value: VoiceShortcut;
  onChange: (sc: VoiceShortcut) => void;
}

/**
 * Rebind control for the Voice-Mode shortcut: shows the current combo as <Kbd>
 * badges, captures the next key chord on click (Escape cancels; reserved keys
 * are ignored), and offers a reset once the user is off the default `V`.
 */
export function ShortcutCapture({ value, onChange }: ShortcutCaptureProps) {
  const t = useTranslations("settings");
  const [capturing, setCapturing] = useState(false);
  const atDefault = isDefaultShortcut(value);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setCapturing(false);
        return;
      }
      if (SHORTCUT_BLOCKED.has(e.key) || isModifierKey(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      onChange(shortcutFromEvent(e));
      setCapturing(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, onChange]);

  return (
    <Stack wrap align="center" direction="row" gap="100">
      <Stack align="center" direction="row" gap="25">
        {formatShortcutParts(value).map((p, i) => (
          <Kbd key={i}>{p}</Kbd>
        ))}
      </Stack>
      <button
        aria-pressed={capturing}
        className={cn(
          "min-w-[130px] cursor-pointer rounded-sm border px-[13px] py-[6px] font-mono text-xs transition-all",
          capturing
            ? "border-accent bg-accent-dim text-accent"
            : "border-border text-foreground-dim hover:border-border-strong hover:text-foreground",
        )}
        onClick={() => setCapturing((c) => !c)}
        type="button"
      >
        {capturing ? t("voiceShortcutCapturing") : t("voiceShortcutChange")}
      </button>
      {!atDefault && (
        <button
          className="cursor-pointer rounded-sm border border-border bg-transparent px-[10px] py-[6px] font-mono text-2xs text-foreground-faint transition-colors hover:text-foreground-dim"
          onClick={() => onChange(DEFAULT_VOICE_SHORTCUT)}
          type="button"
        >
          {t("voiceShortcutReset")}
        </button>
      )}
    </Stack>
  );
}
