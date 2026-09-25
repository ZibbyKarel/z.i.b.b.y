"use client";

import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Container,
  Icon,
  ImmersiveShell,
  type ImmersiveShellProps,
  immersiveBackLinkAttrs,
} from "@zibby/design-system";

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
          data-testid={ImmersivePageTestId.Back}
          href={backHref}
          title={t("back")}
          {...immersiveBackLinkAttrs}
        >
          <Container as="span" style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
            <Icon name="arrow" size="sm" />
          </Container>
        </Link>
      }
    />
  );
}
