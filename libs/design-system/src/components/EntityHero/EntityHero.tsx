"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import type { Size } from "../../tokens";
import { cn } from "../../utils/cn";
import { type AnyStateTone, normalizeStateTone } from "../../stateTone";
import type { IconName } from "../Icon/Icon";
import { Icon } from "../Icon/Icon";
import { Corners } from "../Card/Card";
import { StatePill } from "../StatePill/StatePill";

/**
 * Band height per semantic size. `EntityHero`'s band is much taller than the
 * `Icon`/`StatusDot` uses of {@link Size}, so it owns its own px mapping —
 * `Size` is just the shared T-shirt-size vocabulary, not a single fixed scale.
 * `md` (190px) matches the historical unconditional default.
 */
const entityHeroHeightPx: Record<Size, string> = {
  xs: "160px",
  sm: "180px",
  md: "190px",
  lg: "220px",
  xl: "260px",
};

export enum EntityHeroTestId {
  Root = "entity-hero-root",
  Image = "entity-hero-image",
  GlyphFallback = "entity-hero-glyph",
  UploadButton = "entity-hero-upload",
  RemoveButton = "entity-hero-remove",
  FileInput = "entity-hero-file",
  Name = "entity-hero-name",
  Overlay = "entity-hero-overlay",
}

export interface EntityHeroProps {
  /** Avatar image (data URI or `/avatars/*.png` path). Absent → glyph placeholder. */
  image?: string;
  /** Fallback glyph shown when there is no image (or it fails to load). */
  glyph: IconName;
  /**
   * Entity name, overlaid at the bottom of the band. Optional — omitted (with the
   * rest of the default name/meta/desc block) when {@link EntityHeroProps.children}
   * supplies its own overlaid content.
   */
  name?: string;
  /**
   * Arbitrary content laid over the avatar scrim, in normal flow so the band grows
   * to fit it (the fixed `height` becomes a min-height). Replaces the default
   * name/meta/desc block — the caller owns the overlay. Used to render a rich
   * header (a run's title/state/actions) on top of the assigned entity's avatar.
   */
  children?: ReactNode;
  /** Optional node under the name (category, phase count…). */
  meta?: ReactNode;
  /** Optional node above the name (a pill/badge). */
  tag?: ReactNode;
  /** Short description under the name. */
  desc?: string;
  /**
   * DS.md §8 Inspector hero: a {@link StatePill} rendered beside `name`. Accepts
   * both the canonical and legacy tone vocabulary (see {@link AnyStateTone}).
   * Omitted — no badge, the pre-ZibbyCorp look.
   */
  state?: AnyStateTone;
  /** DS.md §8 Inspector hero's mono id line (e.g. `AG-04 · CODER`), rendered
   *  above the name. Omitted — no id line. */
  idLine?: ReactNode;
  /**
   * Whether the default overlay (tag/name/meta/desc) renders at all. Defaults to
   * `true` — every existing consumer is unchanged. Set `false` when a page's own
   * header already shows the entity's name/description immediately above the hero
   * (D13, `docs/hud2chat/DECISIONS.md`) — the hero then renders as a bare image/glyph
   * band. Has no effect when {@link EntityHeroProps.children} is supplied — the
   * caller already owns the overlay in that case.
   */
  showIdentity?: boolean;
  /** Band height — semantic size, not a raw px value. Defaults to `"md"` (190px). */
  height?: Size;
  /** How the image fills the band — `contain` for wide art, `cover` for portraits. */
  fit?: "cover" | "contain";
  /**
   * How the image fills the band horizontally. `"full"` (default) stretches it edge to
   * edge, as before. `"band"` constrains it to a right-anchored bounded-width strip
   * (with a horizontal fade into the left content area) so header text on the left
   * sits over the plain surface instead of over stretched imagery. Opt-in — every
   * consumer other than the run-detail header keeps the default full-bleed look.
   */
  imageBleed?: "full" | "band";
  /** Enable upload / drag-drop / remove. */
  editable?: boolean;
  onUpload?: (dataUri: string) => void;
  onRemove?: () => void;
  uploadLabel?: string;
  removeLabel?: string;
  placeholder?: string;
}

function readAsDataUri(file: File, onUpload?: (v: string) => void) {
  if (!file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") onUpload?.(reader.result);
  };
  reader.readAsDataURL(file);
}

/**
 * Profile-style hero for an agent or pipeline: the avatar fills a band with the
 * name/meta/desc overlaid at the bottom and dissolving into the panel below.
 * When `editable`, it uploads (click or drag-drop) a file and emits a data URI;
 * the caller enforces any size cap. Falls back to `glyph` when the image is
 * absent or fails to load.
 */
export function EntityHero({
  image,
  glyph,
  name,
  children,
  meta,
  tag,
  desc,
  state,
  idLine,
  showIdentity = true,
  height = "md",
  fit = "cover",
  imageBleed = "full",
  editable = false,
  onUpload,
  onRemove,
  uploadLabel = "Upload image",
  removeLabel = "Remove image",
  placeholder = "Upload image",
}: EntityHeroProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);
  const [tracked, setTracked] = useState(image);
  if (image !== tracked) {
    setTracked(image);
    setFailed(false);
  }
  const showImage = Boolean(image) && !failed;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden",
        showImage ? "bg-background" : "bg-accent-dim",
      )}
      data-testid={EntityHeroTestId.Root}
      onDragOver={editable ? (e) => e.preventDefault() : undefined}
      onDrop={
        editable
          ? (e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) readAsDataUri(file, onUpload);
            }
          : undefined
      }
      style={{ minHeight: entityHeroHeightPx[height] }}
    >
      {showImage ? (
        <img
          alt=""
          className={cn(
            "absolute",
            // band: the whole image, right-anchored, scaled to the band height with the
            // width computed from the aspect ratio — object-contain so nothing crops.
            // full: stretched edge to edge, cropped per `fit`.
            imageBleed === "band"
              ? "inset-y-0 right-0 h-full w-auto object-contain"
              : cn("inset-0 h-full w-full", fit === "cover" ? "object-cover" : "object-contain"),
          )}
          data-testid={EntityHeroTestId.Image}
          onError={() => setFailed(true)}
          src={image}
        />
      ) : (
        <div
          className="absolute inset-0 grid place-items-center text-accent/25"
          data-testid={EntityHeroTestId.GlyphFallback}
          style={{
            backgroundImage:
              "linear-gradient(var(--color-grid) 1px, transparent 1px)," +
              "linear-gradient(90deg, var(--color-grid) 1px, transparent 1px)",
            backgroundSize: "12px 12px",
          }}
        >
          <Corners inset="100" />
          <Icon name={glyph} size="xl" />
        </div>
      )}

      {/* band mode: fade the bounded image into the left content area */}
      {imageBleed === "band" && showImage && (
        <div className="absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r from-surface via-surface/70 to-transparent" />
      )}

      {/* dissolve the image into the panel below */}
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/55 to-transparent" />

      {editable && (
        <div className="absolute top-3 right-3 z-10 flex gap-2">
          <button
            aria-label={uploadLabel}
            className="grid size-7 place-items-center rounded-none border border-border bg-surface text-foreground"
            data-testid={EntityHeroTestId.UploadButton}
            onClick={() => inputRef.current?.click()}
            title={uploadLabel}
            type="button"
          >
            <Icon name={image ? "edit" : "plus"} size="sm" />
          </button>
          {image && (
            <button
              aria-label={removeLabel}
              className="grid size-7 place-items-center rounded-none border border-bad/50 bg-surface text-bad"
              data-testid={EntityHeroTestId.RemoveButton}
              onClick={() => onRemove?.()}
              title={removeLabel}
              type="button"
            >
              <Icon name="trash" size="sm" />
            </button>
          )}
          <input
            accept="image/*"
            className="hidden"
            data-testid={EntityHeroTestId.FileInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) readAsDataUri(file, onUpload);
            }}
            ref={inputRef}
            type="file"
          />
        </div>
      )}

      {editable && !image && (
        <div className="absolute top-3.5 left-4 flex items-center gap-2 text-accent">
          <Icon name="film" size="sm" />
          <span className="font-mono text-[10px] tracking-wider uppercase">{placeholder}</span>
        </div>
      )}

      {children ? (
        <div className="relative z-[1]" data-testid={EntityHeroTestId.Overlay}>
          {children}
        </div>
      ) : (
        showIdentity && (
          <div className="absolute right-5 bottom-3.5 left-5 z-[1]">
            {tag && <div className="mb-1.5">{tag}</div>}
            {idLine && (
              <div className="mb-1 font-mono text-[11px] tracking-wider text-foreground-faint uppercase">
                {idLine}
              </div>
            )}
            <div className="flex items-center gap-2">
              <div
                // Legibility scrim for text over an arbitrary photographic avatar — must
                // stay visually dark regardless of theme (a photo's bright regions need a
                // dark halo to keep the overlaid text readable), unlike `colorBackgroundDeep`
                // which flips near-white in the light theme. Kept as literal black on purpose.
                className="truncate font-mono text-[22px] font-bold text-foreground drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]"
                data-testid={EntityHeroTestId.Name}
              >
                {name}
              </div>
              {state && <StatePill state={normalizeStateTone(state)} />}
            </div>
            {meta && <div className="mt-1.5">{meta}</div>}
            {desc && (
              // Same photographic-legibility exception as the name above.
              <div className="mt-1 max-w-[62ch] text-[12.5px] leading-snug text-foreground-dim drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]">
                {desc}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
