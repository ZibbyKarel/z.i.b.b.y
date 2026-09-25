import type { ReactNode } from "react";
import { AppShell } from "../../components/layout/AppShell/AppShell";

/** ZB-01: replaces `(dashboard)/layout.tsx` unchanged apart from the group
 * rename — every current segment moved into `(company)/` renders inside the
 * same `AppShell`, now rebuilt over the ZibbyCorp DS `AppFrame`. */
export default function CompanyLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
