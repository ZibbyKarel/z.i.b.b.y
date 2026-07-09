"use client";

import type { SubsystemState, SubsystemWithStatus } from "@zibby/contracts";
import {
  Container,
  type DotTone,
  Icon,
  IconTile,
  Panel,
  Stack,
  StatusDot,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Tag,
  type TagTone,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { useMarkSubsystemSeenMutation } from "../../mutations/useMarkSubsystemSeenMutation";
import { AktivitaTab } from "./AktivitaTab";
import { ArtefaktyTab } from "./ArtefaktyTab";
import { GatesTab } from "./GatesTab";
import { RosterTab } from "./RosterTab";

export enum SubsystemDrawerTestId {
  Root = "subsystem-drawer-root",
  Panel = "subsystem-drawer-panel",
  Close = "subsystem-drawer-close",
  Hero = "subsystem-drawer-hero",
  Name = "subsystem-drawer-name",
  Tagline = "subsystem-drawer-tagline",
  Mandate = "subsystem-drawer-mandate",
  Status = "subsystem-drawer-status",
}

export interface SubsystemDrawerProps {
  /** The subsystem to show — the caller (`ChatScreen`) only mounts this when
   * `selectedSubsystemId` is non-null, resolved against the live status list. */
  subsystem: SubsystemWithStatus;
  /** Close the drawer (Escape, header close button). */
  onClose: () => void;
}

// v1 fixed tab set (design doc), same order every time — reused verbatim by
// phases 85-88 for each tab's real content, filenames already reserved:
// `RosterTab.tsx` / `AktivitaTab.tsx` / `GatesTab.tsx` / `ArtefaktyTab.tsx`,
// all under this component's own directory. Roster (85), Aktivita (86), Gates
// (87) and Artefakty (88) have all landed their real content — the drawer no
// longer carries any placeholder machinery.
const SUBSYSTEM_DRAWER_TABS = ["roster", "aktivita", "gates", "artefakty"] as const;

/**
 * Status-dot tone + pulse per subsystem state (design doc vocabulary: klid
 * muted, bezi active, hlaseni a ready Tier-2 report, ceka an urgent Tier-3
 * decision). The DS `StatusDot` tone palette (`DotTone`) has no per-instance
 * color slot, so `bezi` — the design doc's "info/own-color" pairing — reads
 * through the shared `run` tone, the same one every other "actively working"
 * indicator in the app uses (see `ChatScreen`'s `MODE_DOT`). `hlaseni`/`ceka`
 * mirror `SubsystemWeb`'s own per-state read (calm `ok` vs urgent `wait`).
 */
const STATE_DOT: Record<SubsystemState, { tone: DotTone; pulse: boolean }> = {
  klid: { tone: "idle", pulse: false },
  bezi: { tone: "run", pulse: true },
  hlaseni: { tone: "ok", pulse: false },
  ceka: { tone: "wait", pulse: true },
};

/** Count-badge tone for the two states that carry one — mirrors
 * `SubsystemWeb`'s `BADGE_TONE_CLASS` (hlaseni calm ok, ceka urgent warn). */
const STATE_TAG_TONE: Partial<Record<SubsystemState, TagTone>> = {
  hlaseni: "ok",
  ceka: "warn",
};

/**
 * The drawer's hero band. With `heroImage` set (phase 90 art), the portrait
 * layers under the subsystem-colored glow + the bottom legibility gradient;
 * with `heroImage: null` it falls back to the color-graded band alone — that
 * fallback path stays supported forever as the no-image case.
 *
 * Not literally the DS `EntityHero` component: `EntityHero`'s own no-image
 * fallback is a fixed accent tint with no per-instance color prop, so it
 * can't express each subsystem's own brand color. This follows EntityHero's
 * IDIOM instead (a band that dissolves into the panel below via a bottom
 * gradient, name/tagline/mandate/status overlaid near the bottom) as a local
 * composite — recorded per the "never leave the DS-or-local decision
 * implicit" rule. `color` is a contract-validated 6-digit hex
 * (`SubsystemSchema`), so appending a 2-digit alpha suffix for the radial
 * glow is safe, well-formed 8-digit hex CSS — a genuinely dynamic per-instance
 * value with no DS prop equivalent, routed through the DS `Panel`'s own
 * `style` passthrough below rather than a raw inline style on a DOM node.
 */
function heroBandStyle(color: string, heroImage: string | null): CSSProperties {
  const glow = `radial-gradient(130% 160% at 12% -15%, ${color}40 0%, ${color}14 45%, transparent 78%)`;
  if (!heroImage) return { backgroundImage: glow };
  // Phase 90: the hero portrait layers UNDER the color glow; the existing
  // bottom `from-surface` gradient overlay keeps the text legible over it. A
  // taller band so the art reads as a portrait, not a sliver (follow-up in
  // todo.md considers a full EntityHero-style bleed).
  return {
    backgroundImage: `${glow}, url("${heroImage}")`,
    backgroundSize: "auto, cover",
    backgroundPosition: "center, center 22%",
    backgroundRepeat: "no-repeat",
    minHeight: 168,
  };
}

/**
 * The subsystem detail drawer (Phase 84, design doc "an inline panel over the
 * chat, never a page navigation"): docked to the right of the transcript on
 * `lg+` (chat stays interactive to its left — no modal backdrop), a
 * full-width sheet below `lg` (PROVISIONAL — the design doc left mobile
 * behavior open; this is the conservative v1 floor, see phase-84 plan). Only
 * one drawer at a time — selecting another node swaps this component's
 * `subsystem` prop rather than stacking a second drawer (also PROVISIONAL,
 * same doc).
 *
 * Phase 84 built the frame + header + empty tab shell; Roster (85), Aktivita
 * (86), Gates (87) and Artefakty (88) have all landed their real content
 * since — every tab below renders live data, no placeholder remains.
 */
export function SubsystemDrawer({ subsystem, onClose }: SubsystemDrawerProps) {
  const t = useTranslations("subsystems");
  const markSeen = useMarkSubsystemSeenMutation();
  const panelRef = useRef<HTMLDivElement>(null);
  // Tracks which subsystem id has already fired the "seen" acknowledgment —
  // NOT a per-mount ref, since this component stays mounted while the
  // operator swaps between subsystems (single drawer, phase-84 plan): a
  // re-render with the SAME id (e.g. the periodic `useSubsystemsQuery` poll
  // handing down a fresh object) must not refire, but selecting a DIFFERENT
  // subsystem — a genuine "open" of that subsystem's report — must.
  const seenIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (seenIdRef.current === subsystem.id) return;
    seenIdRef.current = subsystem.id;
    markSeen.mutate({ params: { id: subsystem.id }, body: {} });
    // Keyed on the id only (see the ref comment above): markSeen's identity
    // churning on every mutation-state change must not refire this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsystem.id]);

  // Escape closes; focus moves into the drawer on mount and returns to
  // whatever was focused before it (the clicked/keyboard-activated node in
  // `SubsystemWeb`) on unmount — the same a11y idiom as the DS `Dialog`.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  const dot = STATE_DOT[subsystem.state];
  const tagTone = STATE_TAG_TONE[subsystem.state];
  const countLabel =
    subsystem.state === "hlaseni"
      ? t("tier2Badge", { count: subsystem.tier2Count })
      : subsystem.state === "ceka"
        ? t("tier3Badge", { count: subsystem.tier3Count })
        : null;
  const showCount = countLabel !== null && tagTone !== undefined;

  return (
    <div
      className="pointer-events-none absolute inset-y-0 right-0 z-30 flex w-full flex-col p-4 lg:w-[520px]"
      data-testid={SubsystemDrawerTestId.Root}
    >
      <div className="pointer-events-auto flex h-full w-full flex-col">
        <Panel
          elevated
          aria-label={t("drawer.ariaLabel", { name: subsystem.name })}
          data-testid={SubsystemDrawerTestId.Panel}
          ref={panelRef}
          role="region"
          // Bounded to the height this root wrapper is actually given (its
          // `inset-y-0` resolves against `ChatScreen`'s middle band, between
          // the top bar and the composer — see `ChatScreen.tsx`'s outer/inner
          // main-area split, Phase 99) with its own scroll — a computed value
          // with no dedicated `Panel` prop, routed through its `style`
          // passthrough (sanctioned per CLAUDE.md). `100%` (not a viewport
          // `calc`) so the cap always matches that band exactly, however tall
          // the top bar/composer render — the old `calc(100vh - 96px)` guessed
          // a fixed reserve that was shorter than the actual chrome, so the
          // panel's bottom (and the GatesTab "Add rule" button at the end of
          // it) spilled past this wrapper into the composer's band. Still a
          // v1 simplification that scrolls the whole card as one unit rather
          // than pinning the tab bar — fine now that every tab (85-88) renders
          // real, potentially long content.
          style={{ maxHeight: "100%", overflowY: "auto" }}
          tabIndex={-1}
        >
          {/* The DS `Container` (not a raw `div`) so the per-subsystem gradient
              — see `heroBandStyle`'s doc comment — goes through a DS
              component's own `style` passthrough rather than a raw DOM node. */}
          <Container
            data-testid={SubsystemDrawerTestId.Hero}
            overflow="hidden"
            position="relative"
            shrink={false}
            style={heroBandStyle(subsystem.color, subsystem.heroImage)}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/55 to-transparent" />

            <button
              aria-label={t("drawer.close")}
              className="absolute top-3 right-3 z-[1] grid size-7 cursor-pointer place-items-center rounded-sm border border-border bg-background/70 text-foreground-faint backdrop-blur-sm hover:text-foreground"
              data-testid={SubsystemDrawerTestId.Close}
              onClick={onClose}
              type="button"
            >
              <Icon name="x" size="sm" />
            </button>

            <div className="relative z-[1] flex flex-col gap-2 p-4 pt-5">
              <Stack align="center" direction="row" gap="100">
                <IconTile
                  filled={false}
                  glyph="bot"
                  style={{ borderColor: subsystem.color, color: subsystem.color }}
                />
                <Stack gap="25">
                  <Typography
                    mono
                    data-testid={SubsystemDrawerTestId.Name}
                    size="lg"
                    type="label"
                    weight="bold"
                  >
                    {subsystem.name}
                  </Typography>
                  <Typography
                    data-testid={SubsystemDrawerTestId.Tagline}
                    size="xs"
                    type="note"
                    variant="secondary"
                  >
                    {subsystem.tagline}
                  </Typography>
                </Stack>
              </Stack>

              <Typography
                data-testid={SubsystemDrawerTestId.Mandate}
                size="sm"
                type="note"
                variant="tertiary"
              >
                {subsystem.mandate}
              </Typography>

              <Stack
                align="center"
                data-testid={SubsystemDrawerTestId.Status}
                direction="row"
                gap="75"
              >
                <StatusDot pulse={dot.pulse} tone={dot.tone} />
                <Typography mono size="xs" type="note" variant="secondary">
                  {t(`state.${subsystem.state}`)}
                </Typography>
                {showCount && tagTone && <Tag tone={tagTone}>{countLabel}</Tag>}
              </Stack>
            </div>
          </Container>

          <Tabs defaultValue="roster">
            <TabList>
              {SUBSYSTEM_DRAWER_TABS.map((tab) => (
                <Tab key={tab} value={tab}>
                  {t(`drawer.tabs.${tab}`)}
                </Tab>
              ))}
            </TabList>
            {SUBSYSTEM_DRAWER_TABS.map((tab) => (
              <TabPanel key={tab} value={tab}>
                <div className="p-4">
                  {tab === "roster" ? (
                    <RosterTab subsystem={subsystem} />
                  ) : tab === "aktivita" ? (
                    <AktivitaTab subsystem={subsystem} />
                  ) : tab === "gates" ? (
                    <GatesTab subsystem={subsystem} />
                  ) : (
                    <ArtefaktyTab subsystem={subsystem} />
                  )}
                </div>
              </TabPanel>
            ))}
          </Tabs>
        </Panel>
      </div>
    </div>
  );
}
