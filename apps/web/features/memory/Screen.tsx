"use client";

import { useState } from "react";
import { Container, Grid, Stack, Typography } from "@zibby/design-system";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { MemoryGraph } from "./components/MemoryGraph";
import { useMemoryGraphQuery, useNoteQuery } from "./queries";

/**
 * Memory screen: the force-directed wiki-link graph from the real vault, with a
 * note viewer for the selected node. Index-first retrieval lives behind the API;
 * here we visualise the graph and read notes.
 */
export function Screen() {
  const { data: graph } = useMemoryGraphQuery();
  const [selected, setSelected] = useState<string | null>(null);
  const { data: note } = useNoteQuery(selected);

  if (graph && graph.nodes.length === 0) {
    return (
      <PageContainer>
        <EmptyState
          description="No notes in the vault yet. Notes appear here as the daemon writes to it."
          glyph="brain"
          title="Memory is empty"
        />
      </PageContainer>
    );
  }

  return (
    <Grid center align="start" gap="250" maxWidth="1400px" sidebar="right">
      <Container minW0>
        <HudPanel padding="200" title="Knowledge graph">
          {graph ? (
            <MemoryGraph graph={graph} onSelect={setSelected} selectedId={selected} />
          ) : (
            <Typography mono size="sm" type="note" variant="secondary">
              Loading graph…
            </Typography>
          )}
        </HudPanel>
      </Container>

      <Container minW0>
        <HudPanel padding="250" title={note?.title ?? "Note"}>
          {note ? (
            <Stack gap="150">
              <Typography mono size="caption" type="note" variant="tertiary">
                {note.path} · {note.tier}
              </Typography>
              <Typography size="base" type="note" variant="secondary">
                {note.body ?? ""}
              </Typography>
              {note.backlinks && note.backlinks.length > 0 && (
                <Typography mono size="sm" type="note" variant="tertiary">
                  ← {note.backlinks.join(", ")}
                </Typography>
              )}
            </Stack>
          ) : (
            <Typography mono size="sm" type="note" variant="secondary">
              Select a node to read its note.
            </Typography>
          )}
        </HudPanel>
      </Container>
    </Grid>
  );
}
