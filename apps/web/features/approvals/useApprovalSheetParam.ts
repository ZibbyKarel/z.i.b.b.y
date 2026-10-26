"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Sets (or clears) the shell's `?approval=` search param over whatever page
 *  is mounted — the ZB-08 sheet reads it directly, so opening it never
 *  navigates away from the current page. */
export function useApprovalSheetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const approvalId = searchParams.get("approval");
  const open = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("approval", id);
    router.push(`${pathname}?${next.toString()}` as Route);
  };
  const close = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("approval");
    const qs = next.toString();
    router.push((qs ? `${pathname}?${qs}` : pathname) as Route);
  };
  return { approvalId, open, close };
}
