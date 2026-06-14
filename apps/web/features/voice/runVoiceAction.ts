import type { NavPage, VoiceAction } from "./parseUtterance";

/**
 * A localizable acknowledgement of what a dispatched utterance did. `key` is the
 * `voice.ack.*` message id; `values` carries interpolation (e.g. the page name).
 * The screen renders it in an `aria-live` region — nothing here speaks.
 */
export interface VoiceAck {
  key: VoiceAckKey;
  values?: { page: NavPage };
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
  | "heard";

/**
 * The side-effect handlers a {@link VoiceAction} is executed against. Injected so
 * the executor stays pure (the hook binds real mutations/router/exit). `pendingApprovalId`
 * is the latest gate awaiting a decision; `activeRunId` the agent run that "stop" targets.
 */
export interface VoiceActionDeps {
  pendingApprovalId?: string;
  activeRunId?: string;
  approve: (id: string) => void;
  reject: (id: string) => void;
  stop: (runId: string) => void;
  navigate: (route: string) => void;
  stageTask: (text: string) => void;
  close: () => void;
}

/**
 * Execute a parsed {@link VoiceAction} against the injected handlers and return a
 * {@link VoiceAck}. Pure but for the handler calls — when the targeted resource is
 * absent (no pending approval, no running agent) it acts on nothing and returns the
 * "nothing to …" ack, never a silent no-op. `navigate` also exits the overlay.
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
    case "createTask":
      deps.stageTask(action.text);
      return { key: "heard" };
  }
}
