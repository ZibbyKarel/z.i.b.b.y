import type { ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";
import { BrandMark } from "../BrandMark/BrandMark";

export enum CommandBarTestId {
  Root = "command-bar-root",
  Title = "command-bar-title",
  Subtitle = "command-bar-subtitle",
  Text = "command-bar-text",
}

export interface CommandBarProps {
  /** Wordmark next to the logo, e.g. `ZIBBYCORP`. */
  title: string;
  /** Faint trailing path, e.g. `/ BRIDGE`. */
  subtitle?: string;
  /** Controls, right-aligned (use `CommandBarGroup`, `Button`, `SegmentedControl`, …). */
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

/**
 * A 48px screen header bar: `--color-panel`, bottom hairline, mono 10px/.12em. Logo +
 * title on the left, a spacer, then the controls. Sits above a `WidgetBoard`.
 */
export function CommandBar({ title, subtitle, children, ref }: CommandBarProps) {
  return (
    <header
      className="flex h-[48px] flex-none items-center gap-[20px] border-b border-line bg-panel px-[16px] font-mono text-[10px] tracking-[.12em] whitespace-nowrap"
      data-testid={CommandBarTestId.Root}
      ref={ref}
    >
      <div className="flex items-center gap-[10px]">
        <BrandMark size={24} />
        <span
          className="text-[13px] font-semibold tracking-[.18em]"
          data-testid={CommandBarTestId.Title}
        >
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
