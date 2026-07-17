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
import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../../../hooks/usePrefersReducedMotion";
import { useMarkSubsystemSeenMutation } from "../../mutations/useMarkSubsystemSeenMutation";
import { SUBSYSTEM_GLYPH, SUBSYSTEM_ORB_STATE } from "../../subsystemVisuals";
import { AktivitaTab } from "./AktivitaTab";
import { ArtefaktyTab } from "./ArtefaktyTab";
import { GatesTab } from "./GatesTab";
import { RosterTab } from "./RosterTab";

// Same idiom the DS `Dialog` component uses for its own focus trap —
// duplicated here rather than imported, per the Task 2 design decision to
// keep this modal independent of `Dialog` (see the phase-125 design spec).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

/**
 * The modal's own lifecycle, independent of the `open`/mounted question (the
 * parent controls mounting via `{selectedSubsystem && <SubsystemDrawer .../>}`
 * — this only tracks the animation state within that mounted lifetime).
 * `"entering"` is the one-frame initial paint (hidden), flipped to `"open"`
 * by an effect right after mount so the browser has a "from" state to
 * transition away from rather than painting the open state immediately.
 */
export type SubsystemDrawerPhase = "entering" | "open" | "closing";

export const PANEL_ENTER_MS = 220;
export const PANEL_EXIT_MS = 140;
export const BACKDROP_ENTER_MS = 180;
export const BACKDROP_EXIT_MS = 140;
const PANEL_EASE_ENTER = "cubic-bezier(0.16, 1, 0.3, 1)";
const MODAL_WIDTH = "800px";

/**
 * The backdrop's fade — same both directions except duration/easing: 180ms
 * ease-out opening, 140ms ease-in closing (a plain reverse, no extra blur
 * ramp — Velín-D design spec, phase 125).
 */
export function backdropStyle(phase: SubsystemDrawerPhase): CSSProperties {
  const open = phase === "open";
  const duration = phase === "closing" ? BACKDROP_EXIT_MS : BACKDROP_ENTER_MS;
  const easing = phase === "closing" ? "ease-in" : "ease-out";
  return {
    background: "rgba(11, 14, 19, 0.55)",
    backdropFilter: "blur(14px) saturate(140%)",
    opacity: open ? 1 : 0,
    transition: `opacity ${duration}ms ${easing}`,
  };
}

/**
 * The panel's entrance/exit: fade + scale(0.96→1) + translateY(8px→0), 220ms
 * overshoot-free ease-out opening, mirrored 140ms ease-in closing. Under
 * `prefers-reduced-motion` the `transform` half is dropped entirely (both the
 * target value and the transitioned property) — a plain opacity fade, per
 * the design spec.
 */
export function panelTransitionStyle(
  phase: SubsystemDrawerPhase,
  reducedMotion: boolean,
): CSSProperties {
  const open = phase === "open";
  const duration = phase === "closing" ? PANEL_EXIT_MS : PANEL_ENTER_MS;
  const easing = phase === "closing" ? "ease-in" : PANEL_EASE_ENTER;
  const properties = reducedMotion ? ["opacity"] : ["opacity", "transform"];
  return {
    opacity: open ? 1 : 0,
    transform: reducedMotion
      ? undefined
      : open
        ? "scale(1) translateY(0)"
        : "scale(0.96) translateY(8px)",
    transition: properties.map((property) => `${property} ${duration}ms ${easing}`).join(", "),
  };
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

  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<SubsystemDrawerPhase>("entering");
  const closingRef = useRef(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flips "entering" → "open" right after mount, so the browser has a
  // distinct "from" paint to transition away from instead of rendering the
  // fully-open state on the very first frame. `react-hooks/set-state-in-effect`
  // (eslint-plugin-react-hooks v7, React Compiler rules) flags any direct
  // setState call in an effect body — but that's exactly the CSS-entrance-
  // transition idiom this needs: a `requestAnimationFrame` deferral (the
  // rule's usual suggested fix) would leave the panel invisible until a real
  // animation frame fires, which never happens synchronously in the jsdom test
  // environment and would desync from `renderWithProviders`' synchronous act()
  // flush.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("open");
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Any close trigger (Escape, backdrop click, header close button) calls
  // this instead of `onClose` directly: it plays the exit transition, THEN
  // calls the real `onClose` prop once it's done — the parent only unmounts
  // this component after that.
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPhase("closing");
    closeTimeoutRef.current = setTimeout(onClose, PANEL_EXIT_MS);
  }, [onClose]);

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
      if (event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const container = panelRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        container.focus();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || active === container) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [requestClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
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
    <Container
      bottom="0"
      data-testid={SubsystemDrawerTestId.Root}
      left="0"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      padding="200"
      position="fixed"
      right="0"
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        ...backdropStyle(phase),
      }}
      top="0"
      zIndex={40}
    >
      <Panel
        elevated
        aria-label={t("drawer.ariaLabel", { name: subsystem.name })}
        data-testid={SubsystemDrawerTestId.Panel}
        ref={panelRef}
        role="region"
        // Sized as a centered modal (phase 125 — was a docked, viewport-minus-
        // rail-wide panel through phase 99): a fixed width, capped so it never
        // overflows a narrow viewport, same `calc(100vw - 32px)` pattern the
        // DS `Dialog` uses. `maxHeight: "100%"` resolves against the backdrop
        // `Container` above (a `position: fixed` box with `padding="200"`, so
        // effectively "the viewport minus 16px on every side") with its own
        // scroll — a computed value with no dedicated `Panel` prop, routed
        // through its `style` passthrough (sanctioned per CLAUDE.md). Still a
        // v1 simplification that scrolls the whole card as one unit rather
        // than pinning the tab bar — fine now that every tab (85-88) renders
        // real, potentially long content. `panelTransitionStyle` layers the
        // entrance/exit animation on top of this same style object.
        style={{
          maxHeight: "100%",
          maxWidth: "calc(100vw - 32px)",
          overflowY: "auto",
          width: MODAL_WIDTH,
          ...panelTransitionStyle(phase, reducedMotion),
        }}
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
              onClick={requestClose}
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
    </Container>
  );
}
