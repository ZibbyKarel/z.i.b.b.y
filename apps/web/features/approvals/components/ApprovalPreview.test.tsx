import { CodeBlockTestId } from "@zibby/design-system";
import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { ApprovalPreview, splitMcpCmd } from "./ApprovalPreview";

const labels = { cart: "Cart", total: "Total", targets: "Targets", sendTo: "Send to" };

describe("ApprovalPreview — mcp", () => {
  it("shows server + tool in the header and pretty-printed arguments, no empty targets block", () => {
    renderWithProviders(
      <ApprovalPreview
        labels={labels}
        preview={{
          kind: "command",
          shell: "mcp",
          cmd: 'github · create_issue {"title":"Bug","repo":"a/b"}',
          targets: [],
        }}
      />,
    );
    expect(screen.getByText("mcp · github · create_issue")).toBeInTheDocument();
    expect(screen.getByTestId(CodeBlockTestId.Pre)).toHaveTextContent('"title": "Bug"');
    expect(screen.queryByText("Targets")).not.toBeInTheDocument();
  });

  it("still lists targets for a shell command", () => {
    renderWithProviders(
      <ApprovalPreview
        labels={labels}
        preview={{ kind: "command", shell: "bash", cmd: "rm -rf x", targets: ["x/"] }}
      />,
    );
    expect(screen.getByText("Targets")).toBeInTheDocument();
    expect(screen.getByText("x/")).toBeInTheDocument();
  });
});

describe("splitMcpCmd", () => {
  it("keeps truncated (invalid JSON) arguments verbatim", () => {
    expect(splitMcpCmd('s · t {"a":"xx…')).toEqual({ label: "s · t", args: '{"a":"xx…' });
  });
  it("handles a cmd without arguments", () => {
    expect(splitMcpCmd("mcp__weird")).toEqual({ label: "mcp__weird", args: "{}" });
  });
});
