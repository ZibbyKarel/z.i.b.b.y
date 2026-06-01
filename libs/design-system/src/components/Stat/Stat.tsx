import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";
import { Icon, type IconName } from "../Icon/Icon";

export type StatTone = "accent" | "ok" | "warn" | "bad" | "neutral";

export enum StatTestId {
  Root = "stat-root",
  Icon = "stat-icon",
  Value = "stat-value",
  Label = "stat-label",
}

const toneText: Record<StatTone, string> = {
  accent: "text-accent",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  neutral: "text-foreground-dim",
};

export interface StatProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "className"
> {
  value: string | number;
  label: string;
  icon?: IconName;
  tone?: StatTone;
  ref?: React.Ref<HTMLDivElement>;
}

/** A single headline metric: glyph + big mono number + caption. */
export function Stat({
  value,
  label,
  icon,
  tone = "neutral",
  ref,
  ...props
}: StatProps) {
  return (
    <div ref={ref} data-testid={StatTestId.Root} className="flex items-center gap-3" {...props}>
      {icon && (
        <span data-testid={StatTestId.Icon} className={cn("flex", toneText[tone])}>
          <Icon name={icon} size="md" />
        </span>
      )}
      <div>
        <div data-testid={StatTestId.Value} className="whitespace-nowrap font-mono text-4xl font-bold leading-none text-foreground">
          {value}
        </div>
        <div data-testid={StatTestId.Label} className="mt-1 whitespace-nowrap text-sm tracking-wide text-foreground-faint">
          {label}
        </div>
      </div>
    </div>
  );
}
