/* eslint-disable react/forbid-dom-props -- A bespoke full-screen HUD takeover
   (like LoadingScreen): radial backdrop, scanline/grid overlays, the glowing mic
   button and absolutely-placed ambient panels are decorative inline styles with
   no DS prop equivalent — sanctioned escape hatch, file-level. */
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, Stack, StatusDot, Typography } from "@zibby/design-system";
import { useApprovalsQuery } from "../../approvals/queries";
import { useRunsQuery } from "../../runs/queries/useRunsQuery";
import { RUN_STATE } from "../../runs/run";
import { useCatalog } from "../../../state/store";
import { VoiceOrb, type VoiceState } from "./VoiceOrb";
import { VoicePanel } from "./VoicePanel";
import { type VoiceMessage, VoiceTranscript } from "./VoiceTranscript";

const ACCENT = "var(--color-accent)";

interface DemoStep {
  s: VoiceState;
  ms: number;
  reveal?: boolean;
}

/** Compact relative time ("now" / "3m" / "2h") for the activity panel. */
function compactAgo(iso: string, now: number): string {
  const min = Math.floor(Math.max(0, now - Date.parse(iso)) / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
}

export interface VoiceScreenProps {
  onExit: () => void;
}

/**
 * The voice-first interface — a JARVIS-style full-screen takeover with a central
 * animated orb, a state machine (idle → listening → thinking → speaking) driven
 * by the mic button for now, a fading conversation transcript and four ambient
 * glass panels fed by the live HUD data (running agents, pending approvals,
 * recent runs, quick-action skills). `Esc` (or the HUD button) returns to the HUD.
 */
export function VoiceScreen({ onExit }: VoiceScreenProps) {
  const t = useTranslations("voice");

  const [state, setState] = useState<VoiceState>("idle");
  const [revealed, setRevealed] = useState(false);
  // A render-stable "now", ticked once a minute (Date.now() in render is impure).
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: approvals = [] } = useApprovalsQuery();
  const { runs } = useRunsQuery();
  const { skills } = useCatalog();

  const liveRuns = runs.filter((r) => r.status === "running");
  const recent = [...runs]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, 3);

  const demoMessages: VoiceMessage[] = [
    { role: "user", text: t("demo.user1") },
    { role: "zibby", text: t("demo.zibby1") },
    { role: "user", text: t("demo.user2") },
    { role: "zibby", text: t("demo.zibby2") },
  ];
  const messages = revealed ? demoMessages : demoMessages.slice(0, 2);

  // Esc exits voice mode.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onExit]);

  // Tick the clock / relative times once a minute.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current ?? undefined), []);

  // Mic drives a scripted demo cycle (until real speech recognition is wired in).
  const handleMic = () => {
    if (state !== "idle") {
      clearTimeout(timerRef.current ?? undefined);
      setState("idle");
      return;
    }
    const seq: DemoStep[] = [
      { s: "listening", ms: 2200 },
      { s: "thinking", ms: 2600 },
      { s: "speaking", ms: 3000, reveal: true },
      { s: "idle", ms: 0 },
    ];
    let idx = 0;
    const step = () => {
      const cur = seq[idx];
      if (!cur) return;
      setState(cur.s);
      if (cur.reveal) setRevealed(true);
      idx += 1;
      if (idx < seq.length) timerRef.current = setTimeout(step, cur.ms);
    };
    step();
  };

  const isActive = state !== "idle";
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
              background: isActive ? "var(--color-ok)" : ACCENT,
              boxShadow: `0 0 8px ${isActive ? "var(--color-ok)" : ACCENT}`,
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
                      <StatusDot size="50" tone="warn" />
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
          <VoiceOrb state={state} />

          {/* Status line */}
          <div className="min-h-[46px] text-center">
            <div
              style={{
                fontSize: 15.5,
                fontWeight: isActive ? 500 : 400,
                color: isActive ? "var(--color-foreground)" : "var(--color-foreground-faint)",
                letterSpacing: "0.01em",
                transition: "color 0.4s",
              }}
            >
              {t(`state.${state}`)}
            </div>
            {state === "thinking" && (
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
            {state === "listening" && (
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
          </div>
        </Stack>
      </div>

      {/* ── Bottom controls ─────────────────────────────────────────── */}
      <div className="relative z-[2] flex shrink-0 items-center justify-center gap-[14px] border-t border-border px-6 py-[15px]">
        <button
          className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full transition-all"
          onClick={handleMic}
          style={{
            background: isActive ? ACCENT : "rgba(91,141,239,0.10)",
            border: `1.5px solid ${ACCENT}`,
            color: isActive ? "var(--color-background)" : ACCENT,
            boxShadow: isActive ? "0 0 30px rgba(91,141,239,0.38), 0 0 60px rgba(91,141,239,0.13)" : "none",
          }}
          title={isActive ? t("micStop") : t("micStart")}
          type="button"
        >
          <MicGlyph size={22} />
        </button>

        <button
          className="flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-full border border-border bg-transparent text-foreground-dim transition-colors hover:border-accent hover:text-accent"
          title={t("volume")}
          type="button"
        >
          <SpeakerGlyph size={16} />
        </button>

        <Typography mono size="2xs" style={{ letterSpacing: "0.08em" }} type="note" variant="tertiary">
          {t("hint")}
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

/** Speaker SVG — likewise not in the DS icon set. */
function SpeakerGlyph({ size }: { size: number }) {
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
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}
