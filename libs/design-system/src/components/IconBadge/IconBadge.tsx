import { Icon } from "../Icon/Icon";
import type { IconName } from "../Icon/Icon";

export enum IconBadgeTestId {
  Root = "icon-badge-root",
  Count = "icon-badge-count",
}

export interface IconBadgeProps {
  /** Glyph shown under the count. */
  icon: IconName;
  /** Corner count; renders nothing when `<= 0`, `99+` above 99. */
  count: number;
  /** Accessible name of the whole badge (e.g. "3 unresolved"). */
  label: string;
}

/** Non-interactive icon with a corner count (phrasing content — safe inside a button). */
export function IconBadge({ icon, count, label }: IconBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={label}
      className="relative inline-flex text-ink-2"
      data-testid={IconBadgeTestId.Root}
      role="img"
    >
      <Icon name={icon} size="md" />
      <span
        aria-hidden="true"
        className="absolute -top-1 -right-1.5 min-w-4 bg-accent px-1 text-center font-mono text-[10px] leading-4 text-background"
        data-testid={IconBadgeTestId.Count}
      >
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
