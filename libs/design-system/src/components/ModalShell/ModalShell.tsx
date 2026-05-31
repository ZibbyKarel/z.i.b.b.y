import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon, type IconName } from "../Icon/Icon";

export interface ModalShellProps {
  /** Accessible dialog label. */
  label: string;
  glyph: IconName;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Width class, defaults to a 540px dialog. */
  widthClassName?: string;
  children: ReactNode;
}

/**
 * Shared dashboard modal chrome: dimmed backdrop, angular panel, icon + title
 * header and a close button. Click-outside and the × both close.
 */
export function ModalShell({
  label,
  glyph,
  title,
  subtitle,
  onClose,
  widthClassName = "w-[540px]",
  children,
}: ModalShellProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      className="absolute inset-0 z-[100] flex animate-fade-in items-center justify-center bg-[rgba(5,7,10,0.72)] p-6 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "max-h-[90%] max-w-full animate-scale-in overflow-auto rounded-md border border-border-hi bg-panel-hi shadow-modal",
          widthClassName,
        )}
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-sm border border-accent/30 bg-accent-dim text-accent">
            <Icon name={glyph} size={19} />
          </div>
          <div className="flex-1">
            <div className="font-mono text-xl font-bold text-foreground">
              {title}
            </div>
            {subtitle && (
              <div className="text-base text-foreground-dim">{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            aria-label="Zavřít"
            onClick={onClose}
            className="flex p-1 text-foreground-faint outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
