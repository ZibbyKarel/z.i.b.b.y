/**
 * Voice-Mode keyboard shortcut: a serialisable key combination the user can
 * rebind from System settings. The default is plain `V`. The combo is matched
 * against live `keydown` events to toggle the voice takeover, and rendered as a
 * row of <Kbd> badges in the settings picker.
 */
export interface VoiceShortcut {
  /** `KeyboardEvent.key`, compared case-insensitively. */
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

export const DEFAULT_VOICE_SHORTCUT: VoiceShortcut = {
  key: "v",
  ctrl: false,
  meta: false,
  alt: false,
  shift: false,
};

/**
 * Keys that must never be captured as a shortcut: `Escape` is reserved for
 * exiting voice mode, the rest are browser/OS-reserved or lone modifiers.
 */
export const SHORTCUT_BLOCKED = new Set<string>([
  "Escape",
  "Tab",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Pause",
  "PrintScreen",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
]);

const MODIFIER_KEYS = new Set(["Control", "Meta", "Alt", "Shift"]);

/** True for a lone modifier press, which can't stand alone as a shortcut. */
export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

/** Does a live keydown event match the configured shortcut? */
export function matchesShortcut(e: KeyboardEvent, sc: VoiceShortcut | undefined): boolean {
  if (!sc?.key) return false;
  return (
    e.key.toLowerCase() === sc.key.toLowerCase() &&
    e.ctrlKey === sc.ctrl &&
    e.metaKey === sc.meta &&
    e.altKey === sc.alt &&
    e.shiftKey === sc.shift
  );
}

/** Render a shortcut as ordered display tokens (`["⌘", "⇧", "K"]`). */
export function formatShortcutParts(sc: VoiceShortcut | undefined): string[] {
  const s = sc ?? DEFAULT_VOICE_SHORTCUT;
  const parts: string[] = [];
  if (s.ctrl) parts.push("Ctrl");
  if (s.meta) parts.push("⌘");
  if (s.alt) parts.push("Alt");
  if (s.shift) parts.push("⇧");
  const key = s.key || "V";
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts;
}

/** Is this combo the shipped default (plain `V`, no modifiers)? */
export function isDefaultShortcut(sc: VoiceShortcut | undefined): boolean {
  const s = sc ?? DEFAULT_VOICE_SHORTCUT;
  return s.key === DEFAULT_VOICE_SHORTCUT.key && !s.ctrl && !s.meta && !s.alt && !s.shift;
}

/** Build a shortcut from a captured keydown event. */
export function shortcutFromEvent(e: KeyboardEvent): VoiceShortcut {
  return {
    key: e.key,
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    alt: e.altKey,
    shift: e.shiftKey,
  };
}

const STORAGE_KEY = "zibby.voiceShortcut";

/** Read the persisted shortcut from localStorage, falling back to the default. */
export function loadVoiceShortcut(): VoiceShortcut {
  if (typeof window === "undefined") return DEFAULT_VOICE_SHORTCUT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_SHORTCUT;
    const parsed = JSON.parse(raw) as Partial<VoiceShortcut>;
    if (typeof parsed.key !== "string") return DEFAULT_VOICE_SHORTCUT;
    return {
      key: parsed.key,
      ctrl: !!parsed.ctrl,
      meta: !!parsed.meta,
      alt: !!parsed.alt,
      shift: !!parsed.shift,
    };
  } catch {
    return DEFAULT_VOICE_SHORTCUT;
  }
}

/** Persist the shortcut to localStorage. */
export function saveVoiceShortcut(sc: VoiceShortcut): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sc));
  } catch {
    /* storage unavailable — shortcut stays in memory for this session */
  }
}
