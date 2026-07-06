"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { cn } from "../../utils/cn";
import type { IconName } from "../Icon/Icon";
import { Icon } from "../Icon/Icon";

export enum EntityHeroTestId {
  Root = "entity-hero-root",
  Image = "entity-hero-image",
  GlyphFallback = "entity-hero-glyph",
  UploadButton = "entity-hero-upload",
  RemoveButton = "entity-hero-remove",
  FileInput = "entity-hero-file",
  Name = "entity-hero-name",
}

export interface EntityHeroProps {
  /** Avatar image (data URI or `/avatars/*.png` path). Absent → glyph placeholder. */
  image?: string;
  /** Fallback glyph shown when there is no image (or it fails to load). */
  glyph: IconName;
  /** Entity name, overlaid at the bottom of the band. */
  name: string;
  /** Optional node under the name (category, phase count…). */
  meta?: ReactNode;
  /** Optional node above the name (a pill/badge). */
  tag?: ReactNode;
  /** Short description under the name. */
  desc?: string;
  /** Band height in px. */
  height?: number;
  /** How the image fills the band — `contain` for wide art, `cover` for portraits. */
  fit?: "cover" | "contain";
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
  meta,
  tag,
  desc,
  height = 190,
  fit = "cover",
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
      style={{ height }}
    >
      {showImage ? (
        <img
          alt=""
          className={cn("absolute inset-0 h-full w-full", fit === "cover" ? "object-cover" : "object-contain")}
          data-testid={EntityHeroTestId.Image}
          onError={() => setFailed(true)}
          src={image}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-accent/25" data-testid={EntityHeroTestId.GlyphFallback}>
          <Icon name={glyph} size="xl" />
        </div>
      )}

      {/* dissolve the image into the panel below */}
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/55 to-transparent" />

      {editable && (
        <div className="absolute top-3 right-3 z-10 flex gap-2">
          <button
            className="grid size-7 place-items-center rounded-sm border border-border bg-background/70 text-foreground backdrop-blur-sm"
            data-testid={EntityHeroTestId.UploadButton}
            onClick={() => inputRef.current?.click()}
            title={uploadLabel}
            type="button"
          >
            <Icon name={image ? "edit" : "plus"} size="sm" />
          </button>
          {image && (
            <button
              className="grid size-7 place-items-center rounded-sm border border-bad/50 bg-background/70 text-bad backdrop-blur-sm"
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

      <div className="absolute right-5 bottom-3.5 left-5 z-[1]">
        {tag && <div className="mb-1.5">{tag}</div>}
        <div
          className="truncate font-mono text-[22px] font-bold text-foreground drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]"
          data-testid={EntityHeroTestId.Name}
        >
          {name}
        </div>
        {meta && <div className="mt-1.5">{meta}</div>}
        {desc && <div className="mt-1 max-w-[62ch] text-[12.5px] leading-snug text-foreground-dim drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]">{desc}</div>}
      </div>
    </div>
  );
}
