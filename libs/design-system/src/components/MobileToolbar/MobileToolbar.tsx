import type { ReactNode, Ref } from "react";
import { LAYOUT } from "../../tokens";

export enum MobileToolbarTestId {
  Root = "mobile-toolbar-root",
  Leading = "mobile-toolbar-leading",
  Actions = "mobile-toolbar-actions",
}

export interface MobileToolbarProps {
  /** Left slot — the hamburger menu. */
  leading?: ReactNode;
  /** Right-aligned row of icon-only controls. */
  actions?: ReactNode;
  ref?: Ref<HTMLElement>;
}

/** The phone's replacement for `AppHeader`: a compact bar with the menu on the
 *  left and a shrinkable row of icon actions on the right. */
export function MobileToolbar({ leading, actions, ref }: MobileToolbarProps) {
  return (
    <header
      className="flex items-center justify-between gap-2 border-b border-line bg-panel px-3"
      data-testid={MobileToolbarTestId.Root}
      ref={ref}
      style={{ height: LAYOUT.headerHeight }}
    >
      {leading && (
        <div className="flex shrink-0 items-center" data-testid={MobileToolbarTestId.Leading}>
          {leading}
        </div>
      )}
      <div
        className="ml-auto flex min-w-0 items-center justify-end gap-1"
        data-testid={MobileToolbarTestId.Actions}
      >
        {actions}
      </div>
    </header>
  );
}
