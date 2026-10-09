"use client";

import { createContext, useContext } from "react";
import type { Team } from "@zibby/contracts";

export const VAULT_SOURCE = "vault";
export const TEAM_SOURCE_PREFIX = "team:";

export interface KnowledgeSourceValue {
  /** `"vault"` or `"team:<id>"` — the effective (validated) selection. */
  source: string;
  /** The selected team's id, or null for the ZibbyCorp vault. */
  teamId: string | null;
  isVault: boolean;
  /** Teams that own a (read-only) knowledge base — the switcher's options. */
  kbTeams: Team[];
  setSource: (value: string) => void;
}

export const KnowledgeSourceContext = createContext<KnowledgeSourceValue | null>(null);

/** The Knowledge section's shared source selection (vault or a team KB). */
export function useKnowledgeSource(): KnowledgeSourceValue {
  const value = useContext(KnowledgeSourceContext);
  if (!value) throw new Error("useKnowledgeSource must be used inside <KnowledgeSourceProvider>");
  return value;
}
