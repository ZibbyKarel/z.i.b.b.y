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

/** Plain single-key shortcut that opens the New Task dialog from anywhere. */
export const NEW_TASK_SHORTCUT = "n";

interface TaskStore {
  /** Whether the New Task dialog is showing. */
  isOpen: boolean;
  /**
   * Open the New Task dialog. An optional `initialText` seeds the description field
   * — Phase 11.4: a voice transcript (or any external trigger) fills the one field,
   * then the operator confirms the inferred plan behind the same gate.
   */
  open: (initialText?: string) => void;
  close: () => void;
}

const TaskContext = createContext<TaskStore | null>(null);

/**
 * Owns the New Task dialog's open state and a global `N` shortcut (ignored while
 * typing), and mounts the dialog as an overlay above the HUD. Mirrors
 * {@link VoiceProvider}; mount once, high in the client tree (see {@link AppShell}).
 */
export function NewTaskProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialText, setInitialText] = useState<string | undefined>(undefined);
  const open = useCallback((text?: string) => {
    setInitialText(text);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    setInitialText(undefined);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === NEW_TASK_SHORTCUT) {
        e.preventDefault();
        // The keyboard entry opens a blank composer (no seed text).
        setInitialText(undefined);
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
      {/* Keyed on the seed so re-opening with a new transcript re-seeds the field
          (the composer's `text` initializes from `initialText` on mount). */}
      {isOpen && (
        <NewTaskDialog initialText={initialText} key={initialText ?? ""} onClose={close} />
      )}
    </TaskContext.Provider>
  );
}

export function useNewTask(): TaskStore {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useNewTask must be used within NewTaskProvider");
  return ctx;
}
