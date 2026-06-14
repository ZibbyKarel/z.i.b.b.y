import type { NavPage, VoiceAction } from "./parseUtterance";

/**
 * A localizable acknowledgement of what a dispatched utterance did. `key` is the
 * `voice.ack.*` message id; `values` carries interpolation — the page name for a
 * navigation, or the understood text for a dispatch (so ZIBBY can echo it back).
 * The screen renders it in an `aria-live` region and speaks it via TTS.
 */
export interface VoiceAck {
  key: VoiceAckKey;
  values?: { page?: NavPage; task?: string };
}

export type VoiceAckKey =
  | "approved"
  | "nothingToApprove"
  | "rejected"
  | "nothingToReject"
  | "stopped"
  | "nothingToStop"
  | "navigating"
  | "closing"
  // A spoken task: `dispatching` is the optimistic "starting that — <task>" ack the
  // moment it's understood; `started`/`dispatchFailed` are set by the hook once the
  // backend dispatch resolves. `heard` is the empty-utterance no-op (nothing to do).
  | "dispatching"
  | "started"
  | "dispatchFailed"
  | "heard";

/**
 * The side-effect handlers a {@link VoiceAction} is executed against. Injected so
 * the executor stays pure (the hook binds real mutations/router/exit). `pendingApprovalId`
 * is the latest gate awaiting a decision; `activeRunId` the agent run that "stop" targets.
 * `dispatchTask` sends a spoken task straight to the `/tasks` layer — no composer modal,
 * because confirming understanding is the conversation's job, not a form (North Star).
 */
export interface VoiceActionDeps {
  pendingApprovalId?: string;
  activeRunId?: string;
  approve: (id: string) => void;
  reject: (id: string) => void;
  stop: (runId: string) => void;
  navigate: (route: string) => void;
  dispatchTask: (text: string) => void;
  close: () => void;
}

/**
 * Execute a parsed {@link VoiceAction} against the injected handlers and return a
 * {@link VoiceAck}. Pure but for the handler calls — when the targeted resource is
 * absent (no pending approval, no running agent) it acts on nothing and returns the
 * "nothing to …" ack, never a silent no-op. `navigate` also exits the overlay. A spoken
 * task dispatches immediately (no modal) and returns the optimistic `dispatching` ack;
 * the hook upgrades it to `started`/`dispatchFailed` once the backend responds.
 */
export function runVoiceAction(
  action: VoiceAction,
  deps: VoiceActionDeps,
): VoiceAck {
  switch (action.kind) {
    case "approveLatest":
      if (deps.pendingApprovalId) {
        deps.approve(deps.pendingApprovalId);
        return { key: "approved" };
      }
      return { key: "nothingToApprove" };
    case "rejectLatest":
      if (deps.pendingApprovalId) {
        deps.reject(deps.pendingApprovalId);
        return { key: "rejected" };
      }
      return { key: "nothingToReject" };
    case "stopActive":
      if (deps.activeRunId) {
        deps.stop(deps.activeRunId);
        return { key: "stopped" };
      }
      return { key: "nothingToStop" };
    case "navigate":
      deps.close();
      deps.navigate(action.route);
      return { key: "navigating", values: { page: action.page } };
    case "closeOverlay":
      deps.close();
      return { key: "closing" };
    case "createTask": {
      const text = action.text.trim();
      if (!text) return { key: "heard" };
      deps.dispatchTask(text);
      return { key: "dispatching", values: { task: text } };
    }
  }
}
