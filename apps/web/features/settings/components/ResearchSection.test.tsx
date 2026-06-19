import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchConfig } from "@zibby/contracts";
import { ResearchSection, ResearchSectionTestId } from "./ResearchSection";

let config: ResearchConfig = { interests: [], sources: [], financeWatch: false };
const setConfig = vi.fn();

vi.mock("../../research/queries", () => ({ useResearchConfigQuery: () => ({ data: config }) }));
vi.mock("../../research/mutations", () => ({
  useSetResearchConfigMutation: () => ({ mutate: setConfig, isPending: false }),
}));

beforeEach(() => {
  setConfig.mockReset();
  config = { interests: [], sources: [], financeWatch: false };
});

describe("ResearchSection", () => {
  it("seeds the form from the loaded config", () => {
    config = {
      interests: ["ai agents", "devtools"],
      financeWatch: true,
      sources: [{ id: "hn", kind: "hn", label: "Hacker News", enabled: true }],
    };
    render(<ResearchSection />);
    expect(screen.getByTestId(ResearchSectionTestId.Interests)).toHaveValue("ai agents, devtools");
    expect(screen.getByTestId(ResearchSectionTestId.FinanceWatch)).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("research-source-0-label")).toHaveValue("Hacker News");
  });

  it("Save PUTs the parsed interests + finance watch + trimmed sources", async () => {
    config = {
      interests: ["llm"],
      financeWatch: false,
      sources: [
        { id: "feed", kind: "rss", label: "Blog", url: "https://blog.example.com", enabled: true },
      ],
    };
    render(<ResearchSection />);

    await userEvent.click(screen.getByTestId(ResearchSectionTestId.FinanceWatch));
    await userEvent.click(screen.getByTestId(ResearchSectionTestId.Save));

    expect(setConfig).toHaveBeenCalledWith({
      body: {
        interests: ["llm"],
        financeWatch: true,
        sources: [
          {
            id: "feed",
            kind: "rss",
            label: "Blog",
            enabled: true,
            url: "https://blog.example.com",
          },
        ],
      },
    });
  });

  it("adds a source row and drops blank-labelled sources on save", async () => {
    render(<ResearchSection />);

    await userEvent.click(screen.getByTestId(ResearchSectionTestId.AddSource));
    // The new row exists but is blank — it must not survive the save.
    expect(screen.getByTestId("research-source-0-label")).toHaveValue("");
    await userEvent.click(screen.getByTestId(ResearchSectionTestId.Save));

    expect(setConfig).toHaveBeenCalledWith({
      body: { interests: [], financeWatch: false, sources: [] },
    });
  });

  it("a filled-in added source rides into the save body", async () => {
    render(<ResearchSection />);

    await userEvent.click(screen.getByTestId(ResearchSectionTestId.AddSource));
    await userEvent.type(screen.getByTestId("research-source-0-label"), "My Feed");
    await userEvent.click(screen.getByTestId(ResearchSectionTestId.Save));

    expect(setConfig).toHaveBeenCalledWith({
      body: {
        interests: [],
        financeWatch: false,
        sources: [{ id: "source-1", kind: "rss", label: "My Feed", enabled: true }],
      },
    });
  });
});
