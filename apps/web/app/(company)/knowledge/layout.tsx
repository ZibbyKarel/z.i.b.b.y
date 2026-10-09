import type { ReactNode } from "react";
import { KnowledgeSourceProvider } from "../../../features/knowledge/context";

/** Shared across the Trezor / Graf / Destilace tabs so the source selection survives tab switches. */
export default function KnowledgeLayout({ children }: { children: ReactNode }) {
  return <KnowledgeSourceProvider>{children}</KnowledgeSourceProvider>;
}
