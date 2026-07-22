"use client";

import type { HandoffSignalKind } from "@zibby/contracts";
import { useTranslations } from "next-intl";
import { HudCard } from "../../../components/HudCard/HudCard";
import { signalKindDescription, signalKindLabel } from "../../handoff/signalKinds";
import { SignalStatusBadge } from "./SignalStatusBadge";

export enum SignalKindCardTestId {
  /** Prefix — the actual testid is `${Root}-${kind.id}` so a list of cards
   * stays individually selectable (testid-first, mirrors `ArtefaktyTab`'s
   * per-row wrapping div idiom). */
  Root = "signal-kind-card",
}

export interface SignalKindCardProps {
  kind: HandoffSignalKind;
  onSelect: () => void;
  /** Accessible name for the clickable card. */
  selectLabel: string;
}

/**
 * One signal-kind registry entry: label + mono id/slug + status badge + a
 * truncated description — a thin wrapper over the generic {@link HudCard}
 * (mirrors `HookCard`). Click navigates to `/signals/[id]`.
 */
export function SignalKindCard({ kind, onSelect, selectLabel }: SignalKindCardProps) {
  const t = useTranslations("subsystems.handoff");

  return (
    <div data-testid={`${SignalKindCardTestId.Root}-${kind.id}`}>
      <HudCard
        aside={<SignalStatusBadge status={kind.status} />}
        description={signalKindDescription(kind, t)}
        glyph="pulse"
        onClick={onSelect}
        openLabel={selectLabel}
        subtitle={kind.id}
        title={signalKindLabel(kind, t)}
      />
    </div>
  );
}
