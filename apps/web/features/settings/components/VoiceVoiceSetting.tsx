"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, Stack, Typography } from "@zibby/design-system";
import { type SpeechLang, useSpeech } from "../../voice/hooks/useSpeech";
import {
  getPreferredVoiceURI,
  setPreferredVoiceURI,
} from "../../voice/voicePreference";

export interface VoiceVoiceSettingProps {
  /** Locale tag used by the "test" sample utterance. */
  lang: SpeechLang;
}

/**
 * Settings control: pick the voice ZIBBY speaks in (TTS). Populated from the
 * browser's `speechSynthesis` voices; the choice persists in localStorage and
 * {@link useSpeech} reads it at speak-time. "Auto" defers to the locale match.
 * When the browser has no TTS, the control degrades to a short note.
 */
export function VoiceVoiceSetting({ lang }: VoiceVoiceSettingProps) {
  const t = useTranslations("settings");
  const { voices, isSupported, speak } = useSpeech();
  const [value, setValue] = useState<string>(() => getPreferredVoiceURI() ?? "");

  if (!isSupported) {
    return (
      <Typography mono size="xs" type="note" variant="tertiary">
        {t("voiceVoiceUnsupported")}
      </Typography>
    );
  }

  const options = [
    { value: "", label: t("voiceVoiceAuto") },
    ...voices.map((v) => ({ value: v.voiceURI, label: `${v.name} (${v.lang})` })),
  ];

  const onChange = (next: string) => {
    setValue(next);
    setPreferredVoiceURI(next || null);
  };

  return (
    <Stack align="center" direction="row" gap="100">
      <Dropdown
        aria-label={t("voiceVoice")}
        onChange={onChange}
        options={options}
        value={value}
      />
      <Button
        icon="play"
        intent="ghost"
        onClick={() => speak(t("voiceTestSample"), lang)}
        size="sm"
      >
        {t("voiceTest")}
      </Button>
    </Stack>
  );
}
