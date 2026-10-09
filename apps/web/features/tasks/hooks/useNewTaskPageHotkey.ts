import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** The dedicated new-task page (ZB-04b). */
export const NEW_TASK_PAGE_HREF = "/work/tasks/new";

/**
 * Binds Option+N / Alt+N, from anywhere (inputs included — it's a modifier
 * chord like ⌘K), to navigate to the new-task page. Matches `e.code`, not
 * `e.key`: on macOS Option+N is a dead key (`e.key` is "Dead"/"˜"), and
 * `preventDefault` keeps that tilde out of a focused field. The plain `N`
 * dialog shortcut (`TaskContext`) ignores Alt, so the two never collide.
 */
export function useNewTaskPageHotkey(): void {
  const router = useRouter();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.code !== "KeyN") return;
      e.preventDefault();
      router.push(NEW_TASK_PAGE_HREF as Route);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [router]);
}
