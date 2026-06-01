"use client";
import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { useTokens } from "../../DesignSystemContext/hooks";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  selected?: boolean;
  onRemove?: () => void;
  ref?: Ref<HTMLSpanElement>;
}

export function Chip({ selected = false, onRemove, children, style, ref, ...rest }: ChipProps) {
  const tokens = useTokens();
  const computedStyle: CSSProperties = {
    display:         "inline-flex",
    alignItems:      "center",
    gap:             "4px",
    padding:         "2px 8px",
    fontFamily:      tokens.font.mono,
    fontSize:        "0.6875rem",
    fontWeight:      500,
    borderRadius:    tokens.size.radiusFull,
    backgroundColor: selected ? tokens.color.surface.accentSoft : tokens.color.bg.elevated,
    borderWidth:     "1px",
    borderStyle:     "solid",
    borderColor:     selected ? tokens.color.accent.active : tokens.color.border.default,
    color:           selected ? tokens.color.accent.active : tokens.color.text.secondary,
    cursor:          "default",
    whiteSpace:      "nowrap",
    ...style,
  };
  return (
    <span {...rest} ref={ref} style={computedStyle}>
      {children}
      {onRemove && (
        <button
          aria-label="Remove"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit", marginLeft: "2px" }}
        >
          ×
        </button>
      )}
    </span>
  );
}

export interface FilterChipProps extends ChipProps {
  label: string;
}

export function FilterChip({ label, selected = false, onClick, ref, ...rest }: FilterChipProps) {
  const tokens = useTokens();
  const computedStyle: CSSProperties = {
    cursor: "pointer",
    userSelect: "none",
  };
  return (
    <Chip
      {...rest}
      ref={ref}
      selected={selected}
      onClick={onClick}
      style={computedStyle}
      role="checkbox"
      aria-checked={selected}
    >
      {label}
    </Chip>
  );
}
