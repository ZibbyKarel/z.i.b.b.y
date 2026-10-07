"use client";

import { Button } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { defaultPinLabelFor } from "../defaultPinLabelFor";
import { usePagePins } from "../usePagePins";

export enum HeaderPinButtonTestId {
  Button = "header-pin-button",
}

export interface HeaderPinButtonProps {
  /** The current page's pin identity (`pinHrefFor` — pathname + search, minus
   *  `?approval=`). */
  href: string;
}

/**
 * The top bar's pin icon (TODO 10): one click pins the current page into the
 * PINNED rail under its humanized path name (`defaultPinLabelFor`) — no name
 * dialog; the ⋮ menu's PIN PAGE keeps the named flow. When the page is already
 * pinned the icon shows the filled (primary) state and a click unpins it.
 */
export function HeaderPinButton({ href }: HeaderPinButtonProps) {
  const t = useTranslations("pins");
  const { isPagePinned, pinPage, unpinPage, isPending } = usePagePins();
  const pinned = isPagePinned(href);
  return (
    <Button
      aria-label={t(pinned ? "headerUnpin" : "headerPin")}
      aria-pressed={pinned}
      data-testid={HeaderPinButtonTestId.Button}
      icon="pin"
      intent={pinned ? "primary" : "ghost"}
      loading={isPending}
      onClick={() => (pinned ? unpinPage(href) : pinPage(href, defaultPinLabelFor(href)))}
      size="sm"
    />
  );
}
