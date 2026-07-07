import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { Agent } from "@zibby/contracts";
import { EntityHeroTestId } from "@zibby/design-system";
import type { Pipeline } from "../../../domain";
import { renderWithProviders, screen } from "../../../test/render";
import { ChatDetailDialog, ChatDetailDialogTestId } from "./ChatDetailDialog";

const agent: Agent = {
  id: "builder",
  name: "Builder",
  glyph: "hammer",
  description: "Builds things.",
  category: "Delivery",
  instructions: "do the work",
};

// The dashboard-domain Pipeline (what `usePipelinesQuery` hands the palette). The
// dialog only inspects `.name`, `.desc`, `.avatar` and `.phases.length`, so the
// phase entries are minimal fixtures.
const pipeline = {
  id: "delivery",
  name: "Delivery",
  lastRun: "—",
  lastState: "done",
  desc: "",
  file: "~/zibby/pipelines/delivery.pipeline.md",
  phases: [{ id: "p1" }, { id: "p2" }],
  outputs: [],
} as unknown as Pipeline;

describe("ChatDetailDialog (58)", () => {
  it("shows an agent's identity, description and category as a read-only detail", () => {
    renderWithProviders(<ChatDetailDialog detail={{ kind: "agent", agent }} onClose={vi.fn()} />);

    expect(screen.getByTestId(ChatDetailDialogTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(EntityHeroTestId.Name)).toHaveTextContent("Builder");
    expect(screen.getByText("Builds things.")).toBeInTheDocument();
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    // The dialog's kind label (cs catalog) sits in the description slot.
    expect(screen.getByText("Agent")).toBeInTheDocument();
    // No edit affordances — the avatar band is not editable here.
    expect(screen.queryByTestId(EntityHeroTestId.UploadButton)).not.toBeInTheDocument();
  });

  it("shows a pipeline's phase count and falls back when it has no description", () => {
    renderWithProviders(
      <ChatDetailDialog detail={{ kind: "pipeline", pipeline }} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId(EntityHeroTestId.Name)).toHaveTextContent("Delivery");
    // cs plural: "2 fáze".
    expect(screen.getByText("2 fáze")).toBeInTheDocument();
    expect(screen.getByTestId(ChatDetailDialogTestId.Description)).toBeInTheDocument();
  });

  it("closes via the dialog header close button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ChatDetailDialog detail={{ kind: "agent", agent }} onClose={onClose} />);

    // "Zavřít" — the cs close-button aria label.
    await user.click(screen.getByRole("button", { name: "Zavřít" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
