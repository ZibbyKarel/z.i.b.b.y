import { renderWithProviders as render, screen } from "../../test/render";
import { describe, expect, it, vi } from "vitest";
import type { Agent } from "@zibby/contracts";
import { EntityHeroTestId } from "@zibby/design-system";
import type { Pipeline } from "../../domain";
import { Screen } from "./Screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const AGENTS: Agent[] = [];

const PIPELINE: Pipeline = {
  id: "build-feature",
  name: "Build Feature",
  lastRun: "dnes 03:12",
  lastState: "parked",
  desc: "spec → impl → test",
  file: "f",
  outputs: [],
  phases: [],
  avatar: "data:image/png;base64,AAA",
};

const { hooks } = vi.hoisted(() => ({
  hooks: {
    pipelines: {
      data: [] as Pipeline[],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    update: vi.fn(),
  },
}));

vi.mock("./queries", () => ({
  usePipelinesQuery: () => hooks.pipelines,
  usePipelineRunsQuery: () => ({ data: [] }),
  usePipelineRunQuery: () => ({ data: undefined }),
}));
vi.mock("./mutations", () => ({
  useCreatePipelineMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdatePipelineMutation: () => ({ mutate: hooks.update, isPending: false }),
  useDuplicatePipelineMutation: () => ({ mutate: vi.fn(), isPending: false }),
  duplicatePipelineBody: vi.fn(),
}));
vi.mock("../agents", () => ({ useAgentsQuery: () => ({ data: AGENTS }) }));
vi.mock("../tasks", () => ({ useNewTask: () => ({ open: vi.fn() }) }));

describe("pipelines Screen — avatar hero", () => {
  it("renders the selected pipeline's avatar in the detail hero", () => {
    hooks.pipelines = { data: [PIPELINE], isPending: false, isError: false, refetch: vi.fn() };
    render(<Screen selectedId="build-feature" />);
    const image = screen.getByTestId(EntityHeroTestId.Image);
    expect(image).toHaveAttribute("src", PIPELINE.avatar);
  });
});
