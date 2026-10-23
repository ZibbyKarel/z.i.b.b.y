import type { ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";
import { BrandMark } from "../BrandMark/BrandMark";

export enum CommandBarTestId {
  Root = "command-bar-root",
  Title = "command-bar-title",
  Subtitle = "command-bar-subtitle",
  Text = "command-bar-text",
  Button = "command-bar-button",
}

export interface CommandBarProps {
  /** Wordmark next to the logo, e.g. `ZIBBYCORP`. */
  title: string;
  /** Faint trailing path, e.g. `/ BRIDGE`. */
  subtitle?: string;
  /** Show the brand logo before the title (default true). */
  logo?: boolean;
  /** Controls, right-aligned (use `CommandBarGroup`, `Button`, `SegmentedControl`, …). */
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

/**
 * A 48px screen header bar: `--color-panel`, bottom hairline, sans 12px. Logo +
 * title on the left, a spacer, then the controls. Sits above a `WidgetBoard`.
 */
export function CommandBar({ title, subtitle, logo = true, children, ref }: CommandBarProps) {
  return (
    <header
      className="flex h-[48px] flex-none items-center gap-[20px] border-b border-line bg-panel px-[16px] font-sans text-[12px] whitespace-nowrap leading-[normal]"
      data-testid={CommandBarTestId.Root}
      ref={ref}
    >
      <div className="flex items-center gap-[10px]">
        {logo ? <BrandMark size={24} /> : null}
        <span className="text-[14px] font-semibold" data-testid={CommandBarTestId.Title}>
          {title}
        </span>
        {subtitle ? (
          <span className="text-ink-3" data-testid={CommandBarTestId.Subtitle}>
            {subtitle}
          </span>
        ) : null}
      </div>
      <div className="flex-1" />
      {children}
    </header>
  );
}

/** A horizontal cluster of controls inside a `CommandBar` (gap 8px). */
export function CommandBarGroup({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-[8px]">{children}</div>;
}

export interface CommandBarTextProps {
  children: ReactNode;
  /** Faint (`--ink-3`) caption instead of the default dim (`--ink-2`) tabular value. */
  faint?: boolean;
}

/** Plain mono text in a `CommandBar` — a caption (`faint`) or a tabular value like a clock. */
export function CommandBarText({ children, faint = false }: CommandBarTextProps) {
  return (
    <span
      className={cn(faint ? "text-ink-3" : "tabular-nums text-ink-2")}
      data-testid={CommandBarTestId.Text}
    >
      {children}
    </span>
  );
}

export interface CommandBarButtonProps {
  /** `tool` = quiet edit-mode tool; `edit` = the inked EDIT LAYOUT toggle; `done` = its filled state. */
  look?: "tool" | "edit" | "done";
  onClick?: () => void;
  children: ReactNode;
}

const BUTTON_LOOK = {
  tool: "border-line-2 bg-panel px-[10px] py-[5px] text-ink-2 hover:bg-hover hover:text-ink",
  edit: "border-line-2 bg-panel px-[12px] py-[5px] text-ink hover:bg-hover",
  done: "border-accent bg-accent px-[12px] py-[5px] text-accent-contrast hover:bg-accent/90",
} as const;

/** A command-bar button: 1px border, 8px radius, sans 12px medium. */
export function CommandBarButton({ look = "tool", onClick, children }: CommandBarButtonProps) {
  return (
    <button
      className={cn(
        "cursor-pointer rounded-md border border-solid font-medium transition-colors",
        BUTTON_LOOK[look],
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      data-testid={CommandBarTestId.Button}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
