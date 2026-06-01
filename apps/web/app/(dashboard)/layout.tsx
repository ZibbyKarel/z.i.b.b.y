import type { ReactNode } from "react";
import { DashboardChrome } from "../../features/dashboard/DashboardChrome";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardChrome>{children}</DashboardChrome>;
}
