import { describe, expect, it } from "vitest";
import { parseGraphReport } from "./graph-report.parser";

/**
 * A trimmed but structurally faithful excerpt of a real `graphify-out/GRAPH_REPORT.md`
 * (god nodes + communities sections), captured from a run against this repo.
 */
const REALISTIC_SAMPLE = `# Graph Report - z.i.b.b.y  (2026-07-05)

## Corpus Check
- 2079 files · ~1,047,340 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 11757 nodes · 23659 edges · 847 communities (722 shown, 125 thin omitted)

## Graph Freshness
- Built from commit: \`1f25684b\`

## Community Hubs (Navigation)
- [[_COMMUNITY_LoggerService|LoggerService]]

## God Nodes (most connected - your core abstractions)
1. \`Stack()\` - 144 edges
2. \`Typography()\` - 139 edges
3. \`t\` - 132 edges
4. \`apiClient\` - 128 edges
5. \`selectApiResponseBody()\` - 108 edges
6. \`PipelineRunnerService\` - 92 edges
7. \`LoggerService\` - 91 edges
8. \`Container()\` - 91 edges
9. \`renderWithProviders()\` - 87 edges
10. \`ScopedLogger\` - 83 edges

## Surprising Connections (you probably didn't know these)
- \`Doubles\` --references--> \`PipelineRun\`  [EXTRACTED]

## Import Cycles
- None detected.

## Communities (847 total, 125 thin omitted)

### Community 0 - "LoggerService"
Cohesion: 0.03
Nodes (70): AgentProposalFlowService, FrontmatterPreview, ASK_FLOOR, CANDIDATE, Injectable, ApprovalsService, RequestApprovalInput, ResumableRunner (+62 more)

### Community 1 - "Stack"
Cohesion: 0.03
Nodes (110): ConfirmDeleteDialog(), EmptyState(), HudPanel(), QueryError(), QueryLoading(), PageContainer(), PageContainerProps, Default (+102 more)

### Community 15 - "Project"
Cohesion: 0.12
Nodes (6): prepareWorktreeDir(), resolveWorktreeRoot(), firstLine(), exec, Workspace, Project

## Knowledge Gaps
- Nothing notable.

## Suggested Questions
- What does this even do?
`;

describe("parseGraphReport", () => {
  it("parses the God Nodes list (name + edge count) from a realistic report", () => {
    const { godNodes } = parseGraphReport(REALISTIC_SAMPLE);
    expect(godNodes).toEqual([
      { name: "Stack()", degree: 144 },
      { name: "Typography()", degree: 139 },
      { name: "t", degree: 132 },
      { name: "apiClient", degree: 128 },
      { name: "selectApiResponseBody()", degree: 108 },
      { name: "PipelineRunnerService", degree: 92 },
      { name: "LoggerService", degree: 91 },
      { name: "Container()", degree: 91 },
      { name: "renderWithProviders()", degree: 87 },
      { name: "ScopedLogger", degree: 83 },
    ]);
  });

  it("parses Community headings (label + member count) from a realistic report", () => {
    const { communities } = parseGraphReport(REALISTIC_SAMPLE);
    expect(communities).toEqual([
      { label: "LoggerService", size: 70 },
      { label: "Stack", size: 110 },
      { label: "Project", size: 6 },
    ]);
  });

  it("does not bleed content from neighboring sections into god nodes or communities", () => {
    const { godNodes, communities } = parseGraphReport(REALISTIC_SAMPLE);
    expect(godNodes.some((node) => node.name.includes("Doubles"))).toBe(false);
    expect(communities.some((community) => community.label === "Nothing notable")).toBe(false);
  });

  it("returns empty arrays for an empty string", () => {
    expect(parseGraphReport("")).toEqual({ godNodes: [], communities: [] });
    expect(parseGraphReport("   \n  \n")).toEqual({ godNodes: [], communities: [] });
  });

  it("returns empty arrays for unrelated garbage input, never throwing", () => {
    expect(parseGraphReport("not a graph report at all, just some prose.")).toEqual({
      godNodes: [],
      communities: [],
    });
    expect(parseGraphReport("## God Nodes\nnothing parseable here\n")).toEqual({
      godNodes: [],
      communities: [],
    });
    expect(
      parseGraphReport('## Communities (1 total)\n\n### Community 0 - "X"\nno size line here\n'),
    ).toEqual({
      godNodes: [],
      communities: [{ label: "X" }],
    });
  });

  it("tolerates a god node line missing the edge count", () => {
    const markdown = "## God Nodes (most connected)\n1. `Foo()` - lots of edges\n";
    expect(parseGraphReport(markdown).godNodes).toEqual([]);
  });

  it("never throws on non-string input", () => {
    // @ts-expect-error deliberately passing a non-string to verify runtime tolerance
    expect(() => parseGraphReport(null)).not.toThrow();
    // @ts-expect-error deliberately passing a non-string to verify runtime tolerance
    expect(parseGraphReport(undefined)).toEqual({ godNodes: [], communities: [] });
  });
});
