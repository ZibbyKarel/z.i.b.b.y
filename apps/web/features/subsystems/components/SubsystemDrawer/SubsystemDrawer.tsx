"use client";

import type { SubsystemState, SubsystemWithStatus } from "@zibby/contracts";
import {
  Container,
  Icon,
  ORB_STATE,
  Orb,
  Panel,
  Stack,
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
import { SUBSYSTEM_GLYPH, SUBSYSTEM_ORB_STATE } from "../../subsystemVisuals";
import { AktivitaTab } from "./AktivitaTab";
import { ArtefaktyTab } from "./ArtefaktyTab";
import { GatesTab } from "./GatesTab";
import { RosterTab } from "./RosterTab";

export enum SubsystemDrawerTestId {
  Root = "subsystem-drawer-root",
  Panel = "subsystem-drawer-panel",
  Close = "subsystem-drawer-close",
  Hero = "subsystem-drawer-hero",
  Glyph = "subsystem-drawer-glyph",
  Name = "subsystem-drawer-name",
  Mandate = "subsystem-drawer-mandate",
  Status = "subsystem-drawer-status",
  Count = "subsystem-drawer-count",
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

/** Count-badge tone for the two states that carry one — mirrors
 * `SubsystemWeb`'s `BADGE_TONE_CLASS` (report calm ok, waiting urgent warn). */
const STATE_TAG_TONE: Partial<Record<SubsystemState, TagTone>> = {
  report: "ok",
  waiting: "warn",
};

/** The header orb's sphere diameter, and the box reserved for it. The orb's own
 * canvas is `diameter / 0.8` so its glow isn't clipped (see the DS `Orb`), hence
 * the box is larger than the sphere. Numeric px, per the immersive bundle's
 * documented sizing-API exception for continuous canvas geometry. */
const HEADER_ORB_DIAMETER = 44;
const HEADER_ORB_BOX = 48;

/**
 * The header's band. Velín-D (`VcSubsystemDetail`, `velin-c-detail.jsx:213`)
 * tints the header with the subsystem's own hue fading downward into the panel
 * — `linear-gradient(180deg, ${hue}18, transparent)` — and nothing more. No
 * portrait, no radial wash: identity is the orb's job here, and the tint only
 * has to whisper which subsystem you're in.
 *
 * `color` is a contract-validated 6-digit hex (`SubsystemSchema`), so appending
 * the 2-digit `18` alpha suffix is safe, well-formed 8-digit hex CSS — a
 * genuinely dynamic per-instance value with no DS prop equivalent, routed
 * through the DS `Container`'s own `style` passthrough rather than a raw inline
 * style on a DOM node (CLAUDE.md).
 *
 * Exported so the test can assert the gradient directly.
 */
export function headerBandStyle(color: string): CSSProperties {
  return {
    backgroundImage: `linear-gradient(180deg, ${color}18, transparent)`,
    borderBottom: "1px solid var(--color-border)",
  };
}

/**
 * The header's state pill. Velín-D pairs a dot (glowing only while the state is
 * live) with a mono label, both in the STATE's color, inside a hairline capsule
 * — `velin-c-detail.jsx:229-232`.
 *
 * The color comes from the DS `ORB_STATE` table, the same one the map's
 * `OrbNode` chrome reads, so the pill and the orb you clicked always agree on
 * what "working" looks like. Hand-rolled rather than the DS `Tag`: `Tag`'s tones
 * are a fixed semantic palette with no per-instance color slot, and this has to
 * track `ORB_STATE` exactly.
 */
export function statePillStyle(stateColor: string): CSSProperties {
  return {
    borderRadius: 999,
    border: `1px solid ${stateColor}44`,
    background: `${stateColor}12`,
  };
}

/** The pill's dot — identity-free, STATE-colored, and glowing only while live
 * (the same `live` flag that drives the map orb's halo pulse). */
export function stateDotStyle(stateColor: string, live: boolean): CSSProperties {
  return {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: stateColor,
    boxShadow: live ? `0 0 6px ${stateColor}` : "none",
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

  // The orb's state and its chrome color come from the SAME tables the map
  // reads (`subsystemVisuals` → DS `ORB_STATE`), so the header orb and the map
  // node can't drift apart — see `subsystemVisuals`'s doc comment.
  const orbState = SUBSYSTEM_ORB_STATE[subsystem.state];
  const stateStyle = ORB_STATE[orbState];
  const tagTone = STATE_TAG_TONE[subsystem.state];
  // `countValue` is what the badge SHOWS, `countLabel` what it's ANNOUNCED as —
  // see the badge's own comment for why those differ.
  const countValue =
    subsystem.state === "report"
      ? subsystem.tier2Count
      : subsystem.state === "waiting"
        ? subsystem.tier3Count
        : null;
  const countLabel =
    subsystem.state === "report"
      ? t("tier2Badge", { count: subsystem.tier2Count })
      : subsystem.state === "waiting"
        ? t("tier3Badge", { count: subsystem.tier3Count })
        : null;
  const showCount = countLabel !== null && tagTone !== undefined;

  return (
    <div
      className="pointer-events-none absolute inset-y-0 right-0 z-30 flex w-full flex-col p-4 lg:left-[316px] lg:w-auto"
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
              — see `headerBandStyle`'s doc comment — goes through a DS
              component's own `style` passthrough rather than a raw DOM node. */}
          <Container
            data-testid={SubsystemDrawerTestId.Hero}
            padding={["250", "300"]}
            shrink={false}
            style={headerBandStyle(subsystem.color)}
          >
            <Stack align="center" direction="row" gap="200">
              {/* The orb, carried over from the map node the operator just
                  clicked: same identity color, same glyph, same state motion.
                  That continuity IS the design's core gesture — the header
                  should read as the thing you clicked, opened up. */}
              <Container
                height={`${HEADER_ORB_BOX}px`}
                position="relative"
                shrink={false}
                width={`${HEADER_ORB_BOX}px`}
              >
                <Orb
                  detail={1}
                  diameter={HEADER_ORB_DIAMETER}
                  hex={subsystem.color}
                  state={orbState}
                />
                <Container
                  data-testid={SubsystemDrawerTestId.Glyph}
                  pointerEvents="none"
                  position="absolute"
                  style={{ inset: 0, display: "grid", placeItems: "center", color: "#eef3fb" }}
                >
                  <Icon name={SUBSYSTEM_GLYPH[subsystem.id]} size="lg" />
                </Container>
              </Container>

              <Container grow minW0>
                <Stack gap="50">
                  <Stack align="center" direction="row" gap="150">
                    <Typography truncate data-testid={SubsystemDrawerTestId.Name} type="title">
                      {subsystem.name}
                    </Typography>

                    <Container
                      data-testid={SubsystemDrawerTestId.Status}
                      padding={["25", "150"]}
                      shrink={false}
                      style={statePillStyle(stateStyle.color)}
                    >
                      <Stack align="center" direction="row" gap="75">
                        <Container
                          shrink={false}
                          style={stateDotStyle(stateStyle.color, stateStyle.live)}
                        />
                        <Typography nowrap style={{ color: stateStyle.color }} type="micro">
                          {t(`state.${subsystem.state}`)}
                        </Typography>
                      </Stack>
                    </Container>

                    {/* Not in the Velín-D header, kept deliberately: the pill
                        says a decision is waiting, only this says how many.
                        Bare numeral on purpose — the full phrase ("2 čeká na
                        rozhodnutí") sits right next to a pill already reading
                        "Čeká na rozhodnutí", and rendering both stutters. The
                        phrase stays as the accessible name, so a screen reader
                        still gets the count in words. */}
                    {showCount && tagTone && (
                      <Tag
                        aria-label={countLabel}
                        data-testid={SubsystemDrawerTestId.Count}
                        tone={tagTone}
                      >
                        {countValue}
                      </Tag>
                    )}
                  </Stack>

                  {/* Velín-D folds mandate and tagline onto one line — the
                      mandate leads (it's what the subsystem DOES), the epithet
                      trails. */}
                  <Typography
                    truncate
                    data-testid={SubsystemDrawerTestId.Mandate}
                    type="note"
                    variant="secondary"
                  >
                    {subsystem.mandate} · {subsystem.tagline}
                  </Typography>
                </Stack>
              </Container>

              <button
                aria-label={t("drawer.close")}
                className="flex shrink-0 cursor-pointer p-1 text-foreground-faint hover:text-foreground"
                data-testid={SubsystemDrawerTestId.Close}
                onClick={onClose}
                type="button"
              >
                <Icon name="x" size="lg" />
              </button>
            </Stack>
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
