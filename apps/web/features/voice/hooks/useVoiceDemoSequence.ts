"use client";

import { useEffect, useRef, useState } from "react";
import type { VoiceState } from "../components/VoiceOrb";

/** One step of the scripted demo cycle. */
interface DemoStep {
  s: VoiceState;
  ms: number;
  reveal?: boolean;
}

/**
 * What the voice UI needs from a session: the orb state, whether the full
 * transcript is revealed, and a mic toggle. A future real speech-recognition
 * hook replaces this one by returning the same shape.
 */
export interface VoiceSession {
  state: VoiceState;
  /** True once the conversation's second half has been "spoken". */
  revealed: boolean;
  /** Convenience: any non-idle state. */
  isActive: boolean;
  /** The mic button: starts the cycle when idle, aborts back to idle otherwise. */
  toggleMic: () => void;
}

/**
 * The scripted stand-in for a voice session (until real speech recognition is
 * wired in): the mic drives a timed idle → listening → thinking → speaking →
 * idle cycle, revealing the rest of the demo transcript at the speaking step.
 */
export function useVoiceDemoSequence(): VoiceSession {
  const [state, setState] = useState<VoiceState>("idle");
  const [revealed, setRevealed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(timerRef.current ?? undefined), []);

  const toggleMic = () => {
    if (state !== "idle") {
      clearTimeout(timerRef.current ?? undefined);
      setState("idle");
      return;
    }
    const seq: DemoStep[] = [
      { s: "listening", ms: 2200 },
      { s: "thinking", ms: 2600 },
      { s: "speaking", ms: 3000, reveal: true },
      { s: "idle", ms: 0 },
    ];
    let idx = 0;
    const step = () => {
      const cur = seq[idx];
      if (!cur) return;
      setState(cur.s);
      if (cur.reveal) setRevealed(true);
      idx += 1;
      if (idx < seq.length) timerRef.current = setTimeout(step, cur.ms);
    };
    step();
  };

  return { state, revealed, isActive: state !== "idle", toggleMic };
}
