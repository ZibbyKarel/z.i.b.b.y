"use client";

import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Icon, ImmersiveShell, type ImmersiveShellProps } from "@zibby/design-system";

export enum ImmersivePageTestId {
  Back = "immersive-page-back",
}

export interface ImmersivePageProps extends Omit<ImmersiveShellProps, "backSlot"> {
  /** Route the round back button returns to. Defaults to the orb map. */
  backHref?: Route;
}

/**
 * Thin app-level wrapper around DS's `ImmersiveShell` (F0,
 * `docs/plans/hud2chat-F0-immersive-shell.md`): supplies the `next/link` back
 * button DS is not allowed to import itself, plus its translated tooltip/
 * aria-label — every migrated page composes this instead of `ImmersiveShell`
 * directly, keeping the 14 eventual call sites terse.
 */
export function ImmersivePage({ backHref = "/chat", ...rest }: ImmersivePageProps) {
  const t = useTranslations("common");

  return (
    <ImmersiveShell
      {...rest}
      backSlot={
        <Link
          aria-label={t("back")}
          className="flex size-full items-center justify-center text-foreground-dim outline-none transition-colors hover:text-accent focus-visible:text-accent"
          data-testid={ImmersivePageTestId.Back}
          href={backHref}
          title={t("back")}
        >
          <span className="inline-flex rotate-180">
            <Icon name="arrow" size="sm" />
          </span>
        </Link>
      }
    />
  );
}
