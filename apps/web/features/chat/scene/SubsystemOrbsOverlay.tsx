"use client";

import { SUBSYSTEMS, type SubsystemId, type SubsystemWithStatus } from "@zibby/contracts";
import { cn } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useEffect, useRef } from "react";
import type { SubsystemProjection } from "./sceneTypes";

/** How long (ms) after mount the visible label/badge fade-in waits before it
 * starts — timed to roughly land inside the second half of the WebGL mitosis
 * entry animation (phase 96; see `sceneController`'s `NET_FADE_START_FRACTION`
 * × `MITOSIS_TOTAL_DURATION`), so labels don't fly across the screen still
 * attached to their still-travelling orb. The hit-target itself is never
 * delayed — only the visible label/badge opacity. */
const LABEL_FADE_DELAY_MS = 900;
const LABEL_FADE_TRANSITION = "opacity 300ms ease-out";

export enum SubsystemOrbsOverlayTestId {
  /** The overlay root — the `pointer-events-none` group host over the WebGL scene. */
  Root = "subsystem-orbs-overlay",
  /** Per subsystem: `${Node}-${id}` — the focusable hit-target button. */
  Node = "subsystem-orb-node",
  /** Per subsystem: `${Badge}-${id}` — the tier2/tier3 count badge. */
  Badge = "subsystem-orb-badge",
  /** Per subsystem: `${Label}-${id}` — the name label below the orb. */
  Label = "subsystem-orb-label",
  /** Task C1 — the central orb's hit-target, opening {@link CoreOverviewDialog}.
   * Rendered only when `onOpenCore` is supplied. */
  Core = "subsystem-orbs-overlay-core",
}

/** Subscribe to the controller's per-frame mini-orb projections. Absent in jsdom /
 * no-WebGL — the overlay then renders every node statically (at the origin) so
 * component tests work without a scene. */
export type SubscribeProjections = (
  cb: (projections: SubsystemProjection[]) => void,
) => () => void;

export interface SubsystemOrbsOverlayProps {
  /** The 8 named subsystems + live status. Rendered in registry order, keyed by id
   * (a severity-sorted or momentarily-short feed never reflows the octagon). */
  subsystems: SubsystemWithStatus[];
  /** The currently-selected subsystem, if any (drives the ring + `aria-pressed`). */
  selectedId?: SubsystemId | null;
  /** Selecting a node (click / Enter / Space). */
  onSelect: (id: SubsystemId) => void;
  /** Task C1 — activating the central orb's hit-target (click / Enter / Space),
   * opening `CoreOverviewDialog`. The hit-target itself is only rendered when
   * this is supplied — omitting it (Storybook, unit tests scoped to the
   * per-subsystem nodes) simply leaves the center un-clickable. */
  onOpenCore?: () => void;
  /** Projection subscription from the scene controller — see {@link SubscribeProjections}. */
  subscribe?: SubscribeProjections;
  /** Whether the operator asked the OS for reduced motion (phase 96) — skips the
   * delayed label/badge fade-in entirely; they render at full opacity immediately,
   * matching the WebGL scene's own reduced-motion "instant placement" contract. */
  reducedMotion?: boolean;
}

/** Registry rank, for stable registry-order rendering regardless of feed order. */
const REGISTRY_RANK = new Map<SubsystemId, number>(SUBSYSTEMS.map((s, i) => [s.id, i]));

/**
 * The interactive + accessible DOM layer for the WebGL mini-orbs (phase 95). The
 * mini-orbs themselves are rendered by the three.js scene controller; this overlay
 * owns EVERYTHING the WebGL layer can't: a real focusable hit-target per orb
 * (`role="button"`, keyboard, `aria-label`/`aria-pressed`), a name label, the
 * tier2/tier3 badge, and the selection ring — the retired SVG `SubsystemWeb`'s
 * interactive surface, moved to the DOM but re-tracking the orbs by projection so it
 * can never desync (phase 94's SVG↔WebGL calibration problem is gone by
 * construction).
 *
 * Positioning is IMPERATIVE: each node is an absolutely-positioned zero-size anchor
 * whose `transform` + `--orb-d` (on-screen diameter) CSS var are set from the
 * controller's per-frame projections, so tracking the drifting scene costs no React
 * re-render. Under jsdom (no controller / `subscribe`), the nodes simply render at
 * the origin — every node still in the DOM, so component tests select them by testid
 * without any WebGL.
 *
 * It renders one node per entry in `subsystems` (registry order, keyed by id) — the
 * same posture as the retired web's `layoutSubsystems`: a missing subsystem simply
 * has no node; a shuffled feed still renders each at its registry-ranked slot.
 */
export function SubsystemOrbsOverlay({
  subsystems,
  selectedId = null,
  onSelect,
  onOpenCore,
  subscribe,
  reducedMotion = false,
}: SubsystemOrbsOverlayProps) {
  const t = useTranslations("subsystems");
  const tOverview = useTranslations("chat.overview");
  const nodeRefs = useRef(new Map<SubsystemId, HTMLDivElement>());
  // Phase 96: the wrapper around each node's visible label + badge (never the
  // hit-target) — faded in imperatively so it doesn't fly across the screen
  // still attached to its still-travelling WebGL orb.
  const fadeRefs = useRef(new Map<SubsystemId, HTMLDivElement>());

  // Subscribe to projections and position each node imperatively — no per-frame
  // React state. Re-subscribes if `subscribe` changes (controller ready) — the
  // controller fires the callback once immediately, so nodes place before paint.
  useEffect(() => {
    if (!subscribe) return;
    const unsubscribe = subscribe((projections) => {
      for (const proj of projections) {
        const el = nodeRefs.current.get(proj.id);
        if (!el) continue;
        el.style.transform = `translate(${proj.x}px, ${proj.y}px)`;
        el.style.setProperty("--orb-d", `${Math.max(0, proj.r * 2)}px`);
      }
    });
    return unsubscribe;
  }, [subscribe]);

  // Phase 96: delay the visible label/badge fade-in so it lands roughly in the
  // second half of the WebGL entry animation, not synchronized to the (still
  // travelling) orb. One-shot — never replays on a later re-render. Reduced
  // motion skips the delay entirely: labels render at full opacity from the
  // start, matching the WebGL scene's own "instant placement" contract.
  useEffect(() => {
    if (reducedMotion) return;
    for (const el of fadeRefs.current.values()) {
      el.style.opacity = "0";
      el.style.transition = LABEL_FADE_TRANSITION;
    }
    const timer = window.setTimeout(() => {
      for (const el of fadeRefs.current.values()) el.style.opacity = "1";
    }, LABEL_FADE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // Re-fires only if reducedMotion flips — not per subsystems-list change
    // (fadeRefs is a ref, so it's correctly excluded from the dep array).
  }, [reducedMotion]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: SubsystemId) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  };

  const handleCoreKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenCore?.();
    }
  };

  // Registry order, keyed by id — drop unknown ids, keep only present entries.
  const ordered = [...subsystems]
    .filter((s) => REGISTRY_RANK.has(s.id))
    .sort((a, b) => REGISTRY_RANK.get(a.id)! - REGISTRY_RANK.get(b.id)!);

  return (
    <div
      aria-label={t("ariaLabel")}
      className="pointer-events-none absolute inset-0 z-20"
      data-testid={SubsystemOrbsOverlayTestId.Root}
      role="group"
    >
      {/* Task C1 — the central orb's hit-target, opening `CoreOverviewDialog`.
          A fixed anchor (not a per-frame projection like the subsystem nodes
          below): the central orb has no controller-pushed projection of its
          own, and this page's whole cluster is already anchored at a fixed
          `50% 42%` (see `ChatScreen`'s B6 radial backdrop, which frames the
          same cluster) — reusing that anchor keeps the hit-target visually
          centered on the orb without inventing a second coordinate space.
          Rendered only when `onOpenCore` is supplied. */}
      {onOpenCore && (
        <div
          aria-label={tOverview("openAria")}
          className="pointer-events-auto absolute left-1/2 top-[42%] h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
          data-testid={SubsystemOrbsOverlayTestId.Core}
          onClick={onOpenCore}
          onKeyDown={handleCoreKeyDown}
          role="button"
          tabIndex={0}
        />
      )}

      {ordered.map((s) => {
        const selected = selectedId === s.id;
        const stateLabel = t(`state.${s.state}`);
        let ariaLabel = t("nodeAria", { name: s.name, state: stateLabel });
        if (s.state === "hlaseni" && s.tier2Count > 0) {
          ariaLabel += ` ${t("tier2Badge", { count: s.tier2Count })}`;
        }
        if (s.state === "ceka" && s.tier3Count > 0) {
          ariaLabel += ` ${t("tier3Badge", { count: s.tier3Count })}`;
        }
        const badgeCount = s.state === "hlaseni" ? s.tier2Count : s.state === "ceka" ? s.tier3Count : 0;
        const badgeTone = s.state === "ceka" ? "bg-warn" : "bg-ok";

        return (
          // The zero-size anchor: the controller sets its transform + --orb-d each
          // frame; all children are centred/offset off this single point.
          <div
            className="absolute left-0 top-0 h-0 w-0"
            key={s.id}
            ref={(el) => {
              if (el) nodeRefs.current.set(s.id, el);
              else nodeRefs.current.delete(s.id);
            }}
          >
            {/* Selection ring — accent, dashed, just outside the orb. */}
            {selected && (
              <div
                aria-hidden="true"
                className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-accent w-[calc(var(--orb-d,44px)_+_16px)] h-[calc(var(--orb-d,44px)_+_16px)]"
              />
            )}

            {/* The invisible circular hit-target — the only interactive element. */}
            <div
              aria-label={ariaLabel}
              aria-pressed={selected}
              className="pointer-events-auto absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent w-[max(var(--orb-d,44px),44px)] h-[max(var(--orb-d,44px),44px)]"
              data-testid={`${SubsystemOrbsOverlayTestId.Node}-${s.id}`}
              onClick={() => onSelect(s.id)}
              onKeyDown={(event) => handleKeyDown(event, s.id)}
              role="button"
              tabIndex={0}
            />

            {/* Phase 96: wraps the visible label + badge only (never the
                hit-target above) so their opacity can fade in on a delay
                without affecting layout or interactivity. */}
            <div
              ref={(el) => {
                if (el) fadeRefs.current.set(s.id, el);
                else fadeRefs.current.delete(s.id);
              }}
            >
              {/* Badge (top-right) — hlaseni ⇒ calm ok, ceka ⇒ urgent warn. */}
              {badgeCount > 0 && (
                <div
                  className={cn(
                    "absolute left-0 top-0 flex h-[18px] min-w-[18px] translate-x-[9px] -translate-y-[18px] items-center justify-center rounded-full px-[5px] font-mono text-[10px] font-semibold text-background",
                    badgeTone,
                  )}
                  data-testid={`${SubsystemOrbsOverlayTestId.Badge}-${s.id}`}
                >
                  {badgeCount}
                </div>
              )}

              {/* Name label — below the orb (offset by its projected radius + a gap). */}
              <div
                aria-hidden="true"
                className="absolute left-0 top-0 -translate-x-1/2 translate-y-[calc(var(--orb-d,44px)/2_+_7px)] whitespace-nowrap font-mono text-[9px] text-foreground-dim"
                data-testid={`${SubsystemOrbsOverlayTestId.Label}-${s.id}`}
              >
                {s.name}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
