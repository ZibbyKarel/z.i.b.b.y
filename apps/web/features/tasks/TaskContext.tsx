"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { NewTaskDialog } from "./components/NewTaskDialog";
import type { TaskTarget } from "./task";

/** Plain single-key shortcut that opens the New Task dialog from anywhere. */
export const NEW_TASK_SHORTCUT = "n";

interface TaskStore {
  /** Whether the New Task dialog is showing. */
  isOpen: boolean;
  /**
   * Open the New Task dialog. An optional `initialText` seeds the description field
   * — an external trigger fills the one field, then the operator confirms the
   * inferred plan behind the same gate. An optional
   * `initialTarget` locks the destination (e.g. "Run pipeline" pre-chooses a
   * pipeline), bypassing classification.
   */
  open: (initialText?: string, initialTarget?: TaskTarget) => void;
  close: () => void;
}

const TaskContext = createContext<TaskStore | null>(null);

/**
 * Owns the New Task dialog's open state and a global `N` shortcut (ignored while
 * typing), and mounts the dialog as an overlay above the HUD. Mount once, high in
 * the client tree (see {@link AppShell}).
 */
export function NewTaskProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialText, setInitialText] = useState<string | undefined>(undefined);
  const [initialTarget, setInitialTarget] = useState<TaskTarget | undefined>(undefined);
  const open = useCallback((text?: string, target?: TaskTarget) => {
    setInitialText(text);
    setInitialTarget(target);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    setInitialText(undefined);
    setInitialTarget(undefined);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === NEW_TASK_SHORTCUT) {
        e.preventDefault();
        // The keyboard entry opens a blank composer (no seed text, no locked target).
        setInitialText(undefined);
        setInitialTarget(undefined);
        setIsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const value = useMemo<TaskStore>(() => ({ isOpen, open, close }), [isOpen, open, close]);

  return (
    <TaskContext.Provider value={value}>
      {children}
      {/* Keyed on the seed + locked target so re-opening with a new transcript or a
          different pipeline re-seeds the field (the composer initializes from the
          props on mount). */}
      {isOpen && (
        <NewTaskDialog
          initialTarget={initialTarget}
          initialText={initialText}
          key={`${initialTarget?.kind === "orchestrator" ? "orchestrator" : (initialTarget?.id ?? "")}:${initialText ?? ""}`}
          onClose={close}
        />
      )}
    </TaskContext.Provider>
  );
}

export function useNewTask(): TaskStore {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useNewTask must be used within NewTaskProvider");
  return ctx;
}
