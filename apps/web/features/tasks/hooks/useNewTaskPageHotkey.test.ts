import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NEW_TASK_PAGE_HREF, useNewTaskPageHotkey } from "./useNewTaskPageHotkey";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function press(init: KeyboardEventInit, target: EventTarget = document) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("useNewTaskPageHotkey", () => {
  afterEach(() => {
    push.mockReset();
    document.body.innerHTML = "";
  });

  it("Option+N navigates to the new-task page (macOS dead key: key is not 'n')", () => {
    renderHook(() => useNewTaskPageHotkey());
    const event = press({ altKey: true, code: "KeyN", key: "˜" });
    expect(push).toHaveBeenCalledWith(NEW_TASK_PAGE_HREF);
    expect(event.defaultPrevented).toBe(true);
  });

  it("works while focus is in an input, without typing into it", () => {
    renderHook(() => useNewTaskPageHotkey());
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    const event = press({ altKey: true, code: "KeyN", key: "˜" }, input);
    expect(push).toHaveBeenCalledWith(NEW_TASK_PAGE_HREF);
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores plain N and chords with Meta/Ctrl", () => {
    renderHook(() => useNewTaskPageHotkey());
    press({ code: "KeyN", key: "n" });
    press({ altKey: true, metaKey: true, code: "KeyN", key: "n" });
    press({ altKey: true, ctrlKey: true, code: "KeyN", key: "n" });
    expect(push).not.toHaveBeenCalled();
  });

  it("removes its listener on unmount", () => {
    const { unmount } = renderHook(() => useNewTaskPageHotkey());
    unmount();
    press({ altKey: true, code: "KeyN", key: "˜" });
    expect(push).not.toHaveBeenCalled();
  });
});
