"use client";

import { SUBSYSTEMS, type SubsystemId, type SubsystemWithStatus } from "@zibby/contracts";
import { cn } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useEffect, useRef } from "react";
import type { SubsystemProjection } from "./sceneTypes";

export enum SubsystemOrbsOverlayTestId {
  /** The overlay root — the `pointer-events-none` group host over the WebGL scene. */
  Root = "subsystem-orbs-overlay",
  /** Per subsystem: `${Node}-${id}` — the focusable hit-target button. */
  Node = "subsystem-orb-node",
  /** Per subsystem: `${Badge}-${id}` — the tier2/tier3 count badge. */
  Badge = "subsystem-orb-badge",
  /** Per subsystem: `${Label}-${id}` — the name label below the orb. */
  Label = "subsystem-orb-label",
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
  /** Projection subscription from the scene controller — see {@link SubscribeProjections}. */
  subscribe?: SubscribeProjections;
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
  subscribe,
}: SubsystemOrbsOverlayProps) {
  const t = useTranslations("subsystems");
  const nodeRefs = useRef(new Map<SubsystemId, HTMLDivElement>());

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

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: SubsystemId) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
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
        );
      })}
    </div>
  );
}
