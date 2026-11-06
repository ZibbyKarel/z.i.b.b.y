import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutopilotStatus } from "@zibby/contracts";
import type { RunStatusEvent } from "../../runs/runEvents";
import { renderWithProviders as render } from "../../../test/render";
import { ApprovalNotifier } from "./ApprovalNotifier";

let status: AutopilotStatus = { level: "off", pendingApprovals: 0 };
let emit: (e: RunStatusEvent) => void = () => {};
vi.mock("../queries", () => ({ useAutopilotQuery: () => ({ data: status }) }));
vi.mock("../../runs/runEvents", () => ({
  onRunEvent: (l: (e: RunStatusEvent) => void) => {
    emit = l;
    return () => {};
  },
}));

const shown = vi.fn();
class FakeNotification {
  static permission = "granted";
  static requestPermission = vi.fn();
  onclick: (() => void) | null = null;
  constructor(title: string, opts: NotificationOptions) {
    shown(title, opts);
  }
}

const approval: RunStatusEvent = {
  scope: "activity",
  kind: "approval-requested",
  entry: {
    id: "e1",
    at: "2026-11-06T12:00:00.000Z",
    kind: "approval-requested",
    summary: "approval needed: x wants to y",
    refs: { approvalId: "a1" },
  },
};

describe("ApprovalNotifier", () => {
  beforeEach(() => {
    shown.mockClear();
    emit = () => {};
    vi.stubGlobal("Notification", FakeNotification);
  });

  it("notifies a new approval in Approve mode", () => {
    status = { level: "off", pendingApprovals: 0 };
    render(<ApprovalNotifier />);
    emit({ scope: "activity", kind: "run-finished" });
    emit(approval);
    expect(shown).toHaveBeenCalledTimes(1);
    expect(shown).toHaveBeenCalledWith(expect.any(String), {
      body: "approval needed: x wants to y",
      tag: "a1",
    });
  });

  it("stays quiet under AUTOPILOT", () => {
    status = { level: "full", pendingApprovals: 0 };
    render(<ApprovalNotifier />);
    emit(approval);
    expect(shown).not.toHaveBeenCalled();
  });
});
