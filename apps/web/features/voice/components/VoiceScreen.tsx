/* eslint-disable react/forbid-dom-props -- A bespoke full-screen HUD takeover
   (like LoadingScreen): radial backdrop, scanline/grid overlays, the glowing mic
   button and absolutely-placed ambient panels are decorative inline styles with
   no DS prop equivalent — sanctioned escape hatch, file-level. */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Icon, Stack, StatusDot, Typography } from "@zibby/design-system";
import { RUN_STATE } from "../../runs/run";
import { useNow } from "../../../hooks/useNow";
import { MINUTE_MS, compactAgo } from "../../../utils/time";
import { useVoiceData } from "../hooks/useVoiceData";
import { useVoiceSession } from "../hooks/useVoiceSession";
import { useUtteranceDispatch } from "../hooks/useUtteranceDispatch";
import { type SpeechLang, useSpeech } from "../hooks/useSpeech";
import { summarizeBriefing } from "../briefing";
import { VoiceOrb } from "./VoiceOrb";
import { VoicePanel } from "./VoicePanel";
import { type VoiceMessage, VoiceTranscript } from "./VoiceTranscript";

const ACCENT = "var(--color-accent)";

/** Acks shown on screen but not read aloud — their speech is handled elsewhere
 * (`briefing` by `onBrief`) or deliberately silent (`dispatching` = the optimistic
 * "heard you"; ZIBBY speaks only the outcome). */
const SILENT_ACKS = ["briefing", "dispatching"];

export interface VoiceScreenProps {
  onExit: () => void;
}

/**
 * The voice-first interface — a JARVIS-style full-screen takeover with a central
 * animated orb, a fading conversation transcript and four ambient glass panels.
 * Render-only: the session state machine lives in {@link useVoiceDemoSequence}
 * and the live HUD data (running agents, pending approvals, recent runs,
 * quick-action skills) in {@link useVoiceData}. `Esc` (or the HUD button)
 * returns to the HUD.
 */
export function VoiceScreen({ onExit }: VoiceScreenProps) {
  const t = useTranslations("voice");
  const locale = useLocale();
  const lang = locale === "cs" ? "cs-CZ" : "en-US";

  const { mode, state, revealed, isActive, transcript, interim, isSupported, error, toggleMic } =
    useVoiceSession({ lang });
  const { approvals, liveRuns, recent, skills } = useVoiceData();
  // A render-stable "now" for the relative times, ticked once a minute.
  const now = useNow(MINUTE_MS);

  const demoMessages: VoiceMessage[] = [
    { role: "user", text: t("demo.user1") },
    { role: "zibby", text: t("demo.zibby1") },
    { role: "user", text: t("demo.user2") },
    { role: "zibby", text: t("demo.zibby2") },
  ];

  // Live mode renders the real spoken utterance; demo replays the scripted
  // conversation. (ZIBBY's spoken reply arrives with TTS in a later phase.)
  const messages: VoiceMessage[] =
    mode === "live"
      ? transcript
        ? [{ role: "user", text: transcript }]
        : []
      : revealed
        ? demoMessages
        : demoMessages.slice(0, 2);

  // Phase 19/20: ZIBBY speaks back via free browser TTS — command acks and the
  // on-demand briefing. The speaker button mutes; muting also cuts in-flight speech.
  const { speak, stop: stopSpeech, isSpeaking, isSupported: canSpeak } = useSpeech();
  const [muted, setMuted] = useState(false);
  const speechLang = lang as SpeechLang;
  const toggleMute = () => {
    setMuted((m) => {
      if (!m) stopSpeech();
      return !m;
    });
  };

  // The spoken butler's briefing — what's running and what needs you, assembled
  // template-first from the live HUD data (no claude in the browser). Status is
  // **pull, never pushed** (operator feedback): spoken via the "Brief me" button or
  // a spoken "co se děje" / "status" question — ZIBBY never reads run logs unprompted.
  const briefingText = useCallback((): string => {
    const facts = summarizeBriefing({ approvals, liveRuns, recent });
    if (facts.quiet) return t("speak.nothing");
    const parts = [
      t("speak.briefing", { agents: facts.agents, approvals: facts.approvals }),
    ];
    if (facts.topApprovalSkill) {
      parts.push(t("speak.topApproval", { skill: facts.topApprovalSkill }));
    }
    if (facts.done || facts.failed) {
      parts.push(t("speak.recent", { done: facts.done, failed: facts.failed }));
    }
    return parts.join(" ");
  }, [approvals, liveRuns, recent, t]);
  // An explicit request — speaks even when auto-speech is muted. Memoized so it is a
  // stable `onBrief` for the dispatch hook.
  const speakBriefing = useCallback(
    () => speak(briefingText(), speechLang),
    [speak, briefingText, speechLang],
  );

  // Phase 23/24: dispatch every finalized utterance — gate answers (approve/reject)
  // and control verbs (stop/navigate/close) act on the real mutations; a status
  // question ("co se děje" / "status") speaks the briefing (pull); anything else is a
  // spoken **task** dispatched straight to the `/tasks` layer (no composer modal). The
  // ack is surfaced in an aria-live region and spoken via TTS below.
  const { dispatch, ack } = useUtteranceDispatch({
    approvals,
    liveRuns,
    onExit,
    onBrief: speakBriefing,
  });
  const lastDispatched = useRef("");
  useEffect(() => {
    if (mode !== "live") return;
    const spoken = transcript.trim();
    if (!spoken || spoken === lastDispatched.current) return;
    lastDispatched.current = spoken;
    dispatch(spoken);
  }, [mode, transcript, dispatch]);

  // Each command ack is read aloud once (unless muted). Two acks are visual-only:
  // `briefing` (its summary was already spoken by `onBrief`) and `dispatching` (the
  // optimistic "heard you" — ZIBBY speaks only the outcome: started/clarify/failed).
  const spokenAck = useRef<typeof ack>(null);
  useEffect(() => {
    if (mode !== "live" || muted || !ack || ack === spokenAck.current) return;
    spokenAck.current = ack;
    if (SILENT_ACKS.includes(ack.key)) return;
    speak(t(`ack.${ack.key}`, ack.values), speechLang);
  }, [ack, mode, muted, speak, t, speechLang]);

  // The orb/status reflect speech: `speaking` outranks the listen/idle state.
  const displayState = isSpeaking ? "speaking" : state;
  const active = isActive || isSpeaking;

  // The manual "Send" button dispatches the last utterance straight to the tasks
  // layer (same path as the auto-dispatch) — the live transcript, else the demo's
  // last user line so the seam stays exercised deterministically in demo/CI.
  const lastUserUtterance =
    mode === "live"
      ? transcript
      : ([...demoMessages].reverse().find((m) => m.role === "user")?.text ?? "");
  const canSend = lastUserUtterance.trim().length > 0;
  const sendUtterance = () => {
    if (canSend) dispatch(lastUserUtterance);
  };

  // Esc exits voice mode.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onExit]);

  const time = new Date(now);
  const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;

  return (
    <div
      aria-label={t("modeLabel")}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden font-sans"
      role="dialog"
      style={{
        background: "radial-gradient(ellipse 100% 85% at 50% 48%, #0b1422 0%, var(--color-background) 62%)",
        animation: "v-mode-in 0.42s cubic-bezier(.22,.68,0,1.2)",
      }}
    >
      {/* Scanlines + grid overlays */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg,rgba(255,255,255,0.011) 0px,rgba(255,255,255,0.011) 1px,transparent 1px,transparent 5px)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-border) 1px,transparent 1px),linear-gradient(90deg,var(--color-border) 1px,transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%,#000 10%,transparent 80%)",
        }}
      />

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="relative z-[2] flex shrink-0 items-center justify-between border-b border-border px-[22px] py-[13px]">
        <Stack align="center" direction="row" gap="100">
          <Icon name="butlerSign" size="md" tone="accent" />
          <Typography mono size="sm" tone="accent" tracking="widest" type="note">
            {t("modeLabel")}
          </Typography>
          <span
            className="ml-1 inline-block h-1.5 w-1.5 rounded-full transition-all"
            style={{
              background: active ? "var(--color-ok)" : ACCENT,
              boxShadow: `0 0 8px ${active ? "var(--color-ok)" : ACCENT}`,
            }}
          />
        </Stack>

        <Typography mono size="md" type="subtitle" weight="semibold">
          {timeStr}
        </Typography>

        <button
          className="flex cursor-pointer items-center gap-[7px] rounded-sm border border-border px-[14px] py-[7px] font-mono text-xs text-foreground-dim transition-colors hover:border-accent hover:text-foreground"
          onClick={onExit}
          type="button"
        >
          <Icon name="grid" size="xs" />
          {t("exit")}
        </button>
      </div>

      {/* ── Main area ───────────────────────────────────────────────── */}
      <div className="relative z-[1] flex flex-1 items-center justify-center">
        {/* TL — Active agents */}
        <div className="absolute left-5 top-[18px]">
          <VoicePanel icon="bot" title={t("panel.agents")}>
            {liveRuns.length > 0 ? (
              <Stack gap="75">
                {liveRuns.slice(0, 3).map((r) => (
                  <Stack align="center" direction="row" gap="75" key={r.runId}>
                    <StatusDot pulse size="50" tone="run" />
                    <Typography mono size="2xs" type="note">
                      {r.owner}
                    </Typography>
                    <Spacer />
                    {r.pct !== null && (
                      <>
                        <div className="h-0.5 w-10 overflow-hidden rounded-full bg-border">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${r.pct}%` }} />
                        </div>
                        <Typography mono size="2xs" type="note" variant="tertiary">
                          {r.pct}%
                        </Typography>
                      </>
                    )}
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Typography mono size="2xs" type="note" variant="tertiary">
                {t("panel.noAgents")}
              </Typography>
            )}
          </VoicePanel>
        </div>

        {/* TR — Pending approvals */}
        <div className="absolute right-5 top-[18px]">
          <VoicePanel icon="shield" title={t("panel.approvals")}>
            {approvals.length > 0 ? (
              <Stack gap="75">
                {approvals.slice(0, 3).map((a) => (
                  <Stack gap="25" key={a.id}>
                    <Stack align="center" direction="row" gap="75">
                      <StatusDot size="50" tone="wait" />
                      <Typography mono size="xs" type="note">
                        {a.skill}
                      </Typography>
                    </Stack>
                    <div className="pl-3">
                      <Typography leading="snug" size="xs" type="note" variant="secondary">
                        {a.detail}
                      </Typography>
                    </div>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Typography mono size="2xs" type="note" variant="tertiary">
                {t("panel.noApprovals")}
              </Typography>
            )}
          </VoicePanel>
        </div>

        {/* BL — Recent activity */}
        <div className="absolute bottom-[18px] left-5">
          <VoicePanel icon="pulse" title={t("panel.activity")}>
            {recent.length > 0 ? (
              <Stack gap="75">
                {recent.map((r) => (
                  <Stack align="start" direction="row" gap="75" key={r.runId}>
                    <div className="mt-[3px]">
                      <StatusDot size="50" tone={RUN_STATE[r.status].dot} />
                    </div>
                    <Stack gap="0">
                      <Typography size="xs" type="note">
                        {r.owner}
                      </Typography>
                      <Typography mono size="2xs" type="note" variant="tertiary">
                        {compactAgo(r.startedAt, now)}
                      </Typography>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Typography mono size="2xs" type="note" variant="tertiary">
                {t("panel.noActivity")}
              </Typography>
            )}
          </VoicePanel>
        </div>

        {/* BR — Quick actions */}
        <div className="absolute bottom-[18px] right-5">
          <VoicePanel icon="spark" title={t("panel.actions")}>
            {skills.length > 0 ? (
              <Stack gap="75">
                {skills.slice(0, 3).map((s) => (
                  <Stack align="center" direction="row" gap="75" key={s.id}>
                    <Icon name={s.glyph} size="xs" tone="accent" />
                    <Typography mono size="xs" type="note">
                      {s.name}
                    </Typography>
                    <Spacer />
                    <span className="rounded-sm border border-border px-[5px] py-px font-mono text-[9px] text-foreground-faint">
                      ⊕
                    </span>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Typography mono size="2xs" type="note" variant="tertiary">
                {t("panel.noActions")}
              </Typography>
            )}
          </VoicePanel>
        </div>

        {/* ── Center column ─────────────────────────────────────────── */}
        <Stack align="center" gap="300">
          <VoiceTranscript messages={messages} userTag={t("tag.user")} zibbyTag={t("tag.zibby")} />
          <VoiceOrb state={displayState} />

          {/* Status line */}
          <div className="min-h-[46px] text-center">
            <div
              style={{
                fontSize: 15.5,
                fontWeight: active ? 500 : 400,
                color: active ? "var(--color-foreground)" : "var(--color-foreground-faint)",
                letterSpacing: "0.01em",
                transition: "color 0.4s",
              }}
            >
              {t(`state.${displayState}`)}
            </div>
            {displayState === "thinking" && (
              <div className="mt-2 flex items-center justify-center gap-[5px]">
                {[0, 1, 2].map((i) => (
                  <span
                    className="inline-block h-[5px] w-[5px] rounded-full bg-accent"
                    key={i}
                    style={{ animation: `v-dot-blink 1.2s ease-in-out ${i * 0.22}s infinite` }}
                  />
                ))}
              </div>
            )}
            {displayState === "listening" && !interim && (
              <Typography
                mono
                size="2xs"
                style={{ marginTop: 6, display: "block", letterSpacing: "0.14em", animation: "v-fade-up 0.3s ease-out" }}
                tone="accent"
                type="note"
              >
                {t("speakNow")}
              </Typography>
            )}
            {/* Live interim words as ghost text while the utterance is forming. */}
            {mode === "live" && interim && (
              <Typography
                aria-live="polite"
                size="sm"
                style={{ marginTop: 6, display: "block", opacity: 0.55, fontStyle: "italic" }}
                type="note"
                variant="secondary"
              >
                {interim}
              </Typography>
            )}
          </div>

          {/* Live recognition errors — surfaced assertively, not silently swallowed. */}
          {mode === "live" && error && (
            <Typography mono role="alert" size="2xs" tone="bad" type="note">
              {t(`error.${error}`)}
            </Typography>
          )}

          {/* What the last spoken command did — announced in an aria-live region
              (also spoken via TTS above). Dispatches echo the understood task. */}
          {mode === "live" && ack && (
            <Typography mono aria-live="polite" role="status" size="2xs" tone="accent" type="note">
              {t(`ack.${ack.key}`, ack.values)}
            </Typography>
          )}

          {/* No live recognition in this browser — the demo is shown instead. */}
          {!isSupported && (
            <Typography mono size="2xs" type="note" variant="tertiary">
              {t("unsupported")}
            </Typography>
          )}
        </Stack>
      </div>

      {/* ── Bottom controls ─────────────────────────────────────────── */}
      <div className="relative z-[2] flex shrink-0 items-center justify-center gap-[14px] border-t border-border px-6 py-[15px]">
        <button
          className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full transition-all"
          onClick={toggleMic}
          style={{
            background: isActive ? ACCENT : "rgba(91,141,239,0.10)",
            border: `1.5px solid ${ACCENT}`,
            color: isActive ? "var(--color-background)" : ACCENT,
            boxShadow: isActive ? "0 0 30px rgba(91,141,239,0.38), 0 0 60px rgba(91,141,239,0.13)" : "none",
          }}
          title={
            mode === "live"
              ? isActive
                ? t("micStopLive")
                : t("micStartLive")
              : isActive
                ? t("micStop")
                : t("micStart")
          }
          type="button"
        >
          <MicGlyph size={22} />
        </button>

        <button
          aria-pressed={muted}
          className={`flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-full border bg-transparent transition-colors ${
            muted
              ? "border-border text-foreground-faint hover:text-foreground-dim"
              : "border-border text-foreground-dim hover:border-accent hover:text-accent"
          }`}
          onClick={toggleMute}
          title={muted ? t("unmute") : t("mute")}
          type="button"
        >
          <SpeakerGlyph muted={muted} size={16} />
        </button>

        <button
          className="flex items-center gap-[7px] rounded-sm border border-border px-[14px] py-[7px] font-mono text-xs text-foreground-dim transition-colors enabled:cursor-pointer enabled:hover:border-accent enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canSpeak}
          onClick={speakBriefing}
          title={t("briefMe")}
          type="button"
        >
          <Icon name="pulse" size="xs" />
          {t("briefMe")}
        </button>

        <button
          className="flex items-center gap-[7px] rounded-sm border border-border px-[14px] py-[7px] font-mono text-xs text-foreground-dim transition-colors enabled:cursor-pointer enabled:hover:border-accent enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canSend}
          onClick={sendUtterance}
          title={t("send")}
          type="button"
        >
          <Icon name="play" size="xs" />
          {t("send")}
        </button>

        <Typography mono size="2xs" style={{ letterSpacing: "0.08em" }} type="note" variant="tertiary">
          {mode === "live" ? t("hintLive") : t("hint")}
        </Typography>
      </div>
    </div>
  );
}

/** Local spacer — pushes trailing content to the panel edge. */
function Spacer() {
  return <div className="flex-1" />;
}

/** Mic SVG — there is no `mic` glyph in the DS icon set, so it's inlined here. */
function MicGlyph({ size }: { size: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
    >
      <rect height="12" rx="3" width="6" x="9" y="2" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
      <path d="M12 19v3M8 22h8" />
    </svg>
  );
}

/** Speaker SVG — likewise not in the DS icon set. Muted draws the sound waves
 * struck through (so the control reads as mute at a glance). */
function SpeakerGlyph({ size, muted = false }: { size: number; muted?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      {muted ? (
        <path d="M23 9l-6 6M17 9l6 6" />
      ) : (
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
      )}
    </svg>
  );
}
