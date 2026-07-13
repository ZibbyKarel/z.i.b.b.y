/**
 * Task A1 — the center-orb overview modal `/chat` will open (later, C1) when the
 * operator clicks the WebGL orb. `CoreOverviewDialog` reads its roster from
 * `useSubsystemsQuery` internally rather than taking it as a prop, so unlike
 * `CosmicScene.stories.tsx` (which feeds a static roster straight through props)
 * this story seeds a *local* `QueryClient` with a static roster under the same
 * cache key the real hook reads (`getSubsystemsQueryKey`), wrapped in the ts-rest
 * `{ status, body }` envelope `selectApiResponseBody` expects. It deliberately
 * does NOT touch the shared client the global Storybook decorator provides
 * (`.storybook/preview.tsx` — "nothing here mutates the cache across stories"):
 * this nested provider shadows it for just this story.
 */
import { SUBSYSTEMS, type SubsystemState, type SubsystemWithStatus } from "@zibby/contracts";
import type { Meta, StoryObj } from "@storybook/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { getSubsystemsQueryKey } from "../../subsystems/queries/useSubsystemsQuery";
import { CoreOverviewDialog, type CoreOverviewDialogProps } from "./CoreOverviewDialog";

/** One of each live state, spread across the 8 registry subsystems. */
const SAMPLE_STATES: Record<string, SubsystemState> = {
  forge: "bezi",
  puls: "bezi",
  sentinel: "hlaseni",
  maestro: "klid",
  beacon: "ceka",
  scout: "klid",
  herald: "klid",
  loom: "hlaseni",
};

const ROSTER: SubsystemWithStatus[] = SUBSYSTEMS.map((s) => ({
  ...s,
  state: SAMPLE_STATES[s.id] ?? "klid",
  tier2Count: 0,
  tier3Count: 0,
}));

function StoryDialog(props: CoreOverviewDialogProps) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  );
  client.setQueryData(getSubsystemsQueryKey(), { body: ROSTER, status: 200 });

  return (
    <QueryClientProvider client={client}>
      <CoreOverviewDialog {...props} />
    </QueryClientProvider>
  );
}

const meta: Meta<typeof StoryDialog> = {
  args: {
    onClose: () => {},
    onSelectSubsystem: () => {},
    open: true,
  },
  component: StoryDialog,
  parameters: { layout: "fullscreen" },
  title: "Chat/CoreOverviewDialog",
};
export default meta;

type Story = StoryObj<typeof StoryDialog>;

export const Open: Story = {};
