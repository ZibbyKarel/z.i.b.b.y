"use client";

import type { PinKind } from "@zibby/contracts";
import { Button } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { usePinToggle } from "../usePinToggle";

export interface PinButtonProps {
  kind: PinKind;
  id: string;
}

/** Top-right pin/unpin toggle for an agent/pipeline/chain detail page —
 *  same action-row position as Run/Edit/Delete on every detail screen. */
export function PinButton({ kind, id }: PinButtonProps) {
  const t = useTranslations("pins");
  const { isPinned, toggle, isPending } = usePinToggle();
  const pinned = isPinned(kind, id);
  return (
    <Button
      icon="pin"
      intent="ghost"
      loading={isPending}
      onClick={() => toggle(kind, id)}
      size="sm"
    >
      {t(pinned ? "unpin" : "pin")}
    </Button>
  );
}
