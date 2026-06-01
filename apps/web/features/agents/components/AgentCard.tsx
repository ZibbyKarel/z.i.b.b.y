import {
  Button,
  Card,
  Chip,
  Container,
  Divider,
  IconTile,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { AgentDef } from "../../../domain";
import { ModelBadge, ThinkBadge } from "../../pipelines/components/PhaseChain";

export interface AgentCardProps {
  agent: AgentDef;
  onEdit?: (agent: AgentDef) => void;
}

export function AgentCard({ agent, onEdit }: AgentCardProps) {
  return (
    <Card corners interactive radius="sm">
      <Container padding="150">
        <Stack gap="150">
          <Stack align="start" direction="row" gap="150">
            <IconTile glyph={agent.glyph} size="md" />
            <Container grow minW0>
              <Stack gap="25">
                <Typography mono truncate size="md" type="note" weight="semibold">
                  {agent.name}
                </Typography>
                <Typography
                  leading="snug"
                  size="caption"
                  type="note"
                  variant="secondary"
                >
                  {agent.role}
                </Typography>
              </Stack>
            </Container>
          </Stack>

          <Stack wrap direction="row" gap="75">
            <ModelBadge model={agent.model} />
            <ThinkBadge level={agent.thinking} />
            {agent.tools.slice(0, 4).map((t) => (
              <Chip key={t} tone="neutral">
                {t}
              </Chip>
            ))}
          </Stack>

          <Divider />
          <Stack align="center" direction="row" justify="between">
            <Container minW0 maxWidth="150px">
              <Typography mono truncate size="xs" type="note" variant="tertiary">
                {agent.file}
              </Typography>
            </Container>
            <Button icon="edit" intent="ghost" onClick={() => onEdit?.(agent)} size="sm">
              Edit raw .agent.md
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
