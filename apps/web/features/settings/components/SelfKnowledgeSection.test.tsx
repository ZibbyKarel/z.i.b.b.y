import type { SelfKnowledge } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { SelfKnowledgeSection, SelfKnowledgeSectionTestId } from "./SelfKnowledgeSection";

const SNAPSHOT: SelfKnowledge = {
  markdown: "# Self-Knowledge\n\n<!-- AUTO:AGENTS:START -->\nkoder\n<!-- AUTO:AGENTS:END -->\n",
  generatedAt: "2026-07-05T00:00:00.000Z",
  drift: false,
  sections: { agents: 3, pipelines: 1, gateRules: 5, channels: 5 },
};

let queryResult: {
  data: SelfKnowledge | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
} = { data: SNAPSHOT, isPending: false, isError: false, refetch: vi.fn() };

vi.mock("../../self-knowledge", () => ({
  useSelfKnowledgeQuery: () => queryResult,
}));

describe("SelfKnowledgeSection", () => {
  it("renders the markdown body and an up-to-date drift chip when there is no drift", () => {
    queryResult = { data: SNAPSHOT, isPending: false, isError: false, refetch: vi.fn() };
    render(<SelfKnowledgeSection />);
    expect(screen.getByTestId(SelfKnowledgeSectionTestId.Markdown)).toHaveTextContent("koder");
    expect(screen.getByTestId(SelfKnowledgeSectionTestId.DriftChip)).toHaveTextContent(
      "Aktuální",
    );
  });

  it("shows a drift chip when the note has drifted", () => {
    queryResult = {
      data: { ...SNAPSHOT, drift: true },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    render(<SelfKnowledgeSection />);
    expect(screen.getByTestId(SelfKnowledgeSectionTestId.DriftChip)).toHaveTextContent(
      "Neaktuální",
    );
  });

  it("renders the section counts", () => {
    queryResult = { data: SNAPSHOT, isPending: false, isError: false, refetch: vi.fn() };
    render(<SelfKnowledgeSection />);
    const sections = screen.getByTestId(SelfKnowledgeSectionTestId.Sections);
    expect(sections.textContent).toContain("3");
    expect(sections.textContent).toContain("5");
  });

  it("shows the loading state while pending", () => {
    queryResult = { data: undefined, isPending: true, isError: false, refetch: vi.fn() };
    render(<SelfKnowledgeSection />);
    expect(screen.queryByTestId(SelfKnowledgeSectionTestId.Markdown)).not.toBeInTheDocument();
  });

  it("shows the error state on query failure", () => {
    queryResult = { data: undefined, isPending: false, isError: true, refetch: vi.fn() };
    render(<SelfKnowledgeSection />);
    expect(screen.queryByTestId(SelfKnowledgeSectionTestId.Markdown)).not.toBeInTheDocument();
  });
});
