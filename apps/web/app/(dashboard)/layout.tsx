import type { ReactNode } from "react";
import { Providers } from "../providers";
import { DashboardChrome } from "../../features/dashboard/DashboardChrome";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <DashboardChrome>{children}</DashboardChrome>
    </Providers>
  );
}
