import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { MobileToolbar, MobileToolbarTestId } from "./MobileToolbar";

describe("MobileToolbar", () => {
  it("renders leading and actions slots in a header", () => {
    render(<MobileToolbar actions={<button>act</button>} leading={<button>lead</button>} />);
    expect(screen.getByTestId(MobileToolbarTestId.Root).tagName).toBe("HEADER");
    expect(screen.getByTestId(MobileToolbarTestId.Leading)).toHaveTextContent("lead");
    expect(screen.getByTestId(MobileToolbarTestId.Actions)).toHaveTextContent("act");
  });

  it("omits the leading wrapper without leading", () => {
    render(<MobileToolbar actions={<span>a</span>} />);
    expect(screen.queryByTestId(MobileToolbarTestId.Leading)).toBeNull();
  });
});
