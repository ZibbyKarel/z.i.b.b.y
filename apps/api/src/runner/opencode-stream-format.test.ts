import { describe, expect, it } from "vitest";
import {
  extractOpencodeCost,
  extractOpencodeSessionId,
  formatOpencodeStreamLine,
} from "./opencode-stream-format";

// Real lines captured from `opencode run --standalone --format json` (v2.0.12,
// opencode/big-pickle), trimmed of irrelevant metadata.
const SES = "ses_e2f4ac182ffeEwUpucbRhPU1Rq";
const STEP_START = `{"type":"step_start","timestamp":1794502902448,"sessionID":"${SES}","part":{"id":"prt_1","sessionID":"${SES}","messageID":"msg_1","type":"step-start"}}`;
const STEP_FINISH = `{"type":"step_finish","timestamp":1794502904443,"sessionID":"${SES}","part":{"id":"prt_2","sessionID":"${SES}","messageID":"msg_1","type":"step-finish","reason":"tool-calls","cost":0.0125,"tokens":{"input":8172,"output":143,"reasoning":140,"cache":{"read":384,"write":0}}}}`;
const TEXT = `{"type":"text","timestamp":1794502857754,"sessionID":"${SES}","part":{"id":"prt_3","type":"text","text":"BANANA","time":{"start":1,"end":2}}}`;
const SHELL_OK = `{"type":"tool_use","timestamp":1794502876477,"sessionID":"${SES}","part":{"type":"tool","id":"call_0","tool":"shell","state":{"status":"completed","input":{"command":"ls -la"},"output":"total 8\\n-rw-r--r--  1 zibar  wheel  5 victim.txt\\n","title":"shell"}}}`;
const SHELL_BLOCKED = `{"type":"tool_use","timestamp":1794502907997,"sessionID":"${SES}","part":{"type":"tool","id":"call_f","tool":"shell","state":{"status":"error","input":{"command":"rm old-build.log","workdir":"/tmp/work"},"error":"Blocked by the ZibbyOS gate (denied)."}}}`;
const NO_ROUTE = `{"type":"error","timestamp":1794502910000,"sessionID":"${SES}","error":{"type":"provider.no-route","message":"Model unavailable: opencode/nope"}}`;

describe("formatOpencodeStreamLine", () => {
  it("hides step bookkeeping and passes text through", () => {
    expect(formatOpencodeStreamLine(STEP_START)).toBeNull();
    expect(formatOpencodeStreamLine(STEP_FINISH)).toBeNull();
    expect(formatOpencodeStreamLine(TEXT)).toBe("BANANA");
  });

  it("renders a shell call with its output", () => {
    expect(formatOpencodeStreamLine(SHELL_OK)).toBe(
      "● Shell$ ls -la\n  ⎿ total 8\n     -rw-r--r--  1 zibar  wheel  5 victim.txt",
    );
  });

  it("marks a gate-blocked call as an error result", () => {
    expect(formatOpencodeStreamLine(SHELL_BLOCKED)).toBe(
      "● Shell$ rm old-build.log\n  ⎿ ⚠ Blocked by the ZibbyOS gate (denied).",
    );
  });

  it("renders a file tool by its path and an error event", () => {
    const edit = `{"type":"tool_use","sessionID":"${SES}","part":{"tool":"edit","state":{"status":"completed","input":{"path":"/w/a.ts","oldString":"a","newString":"b"},"output":""}}}`;
    expect(formatOpencodeStreamLine(edit)).toBe("● edit /w/a.ts");
    expect(formatOpencodeStreamLine(NO_ROUTE)).toBe(
      "⚠ opencode error: Model unavailable: opencode/nope",
    );
  });

  it("passes non-JSON and unknown events through verbatim", () => {
    expect(formatOpencodeStreamLine("plain stderr text")).toBe("plain stderr text");
    const unknown = `{"type":"something_new","sessionID":"${SES}"}`;
    expect(formatOpencodeStreamLine(unknown)).toBe(unknown);
  });
});

describe("opencode extractors", () => {
  it("reads cost only from step_finish", () => {
    expect(extractOpencodeCost(STEP_FINISH)).toBe(0.0125);
    expect(extractOpencodeCost(STEP_START)).toBeNull();
    expect(extractOpencodeCost(TEXT)).toBeNull();
  });

  it("reads the sessionID from any event", () => {
    expect(extractOpencodeSessionId(STEP_START)).toBe(SES);
    expect(extractOpencodeSessionId(SHELL_BLOCKED)).toBe(SES);
    expect(extractOpencodeSessionId("not json")).toBeNull();
  });
});
