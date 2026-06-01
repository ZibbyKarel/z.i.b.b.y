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
    <Card interactive corners radius="sm">
      <Container padding="150">
        <Stack gap="150">
          <Stack direction="row" align="start" gap="150">
            <IconTile glyph={agent.glyph} size="md" />
            <Container grow minW0>
              <Stack gap="25">
                <Typography type="note" mono weight="semibold" size="md" truncate>
                  {agent.name}
                </Typography>
                <Typography
                  type="note"
                  variant="secondary"
                  size="caption"
                  leading="snug"
                >
                  {agent.role}
                </Typography>
              </Stack>
            </Container>
          </Stack>

          <Stack direction="row" wrap gap="75">
            <ModelBadge model={agent.model} />
            <ThinkBadge level={agent.thinking} />
            {agent.tools.slice(0, 4).map((t) => (
              <Chip key={t} tone="neutral">
                {t}
              </Chip>
            ))}
          </Stack>

          <Divider />
          <Stack direction="row" align="center" justify="between">
            <Container maxWidth="150px" minW0>
              <Typography type="note" mono size="xs" variant="tertiary" truncate>
                {agent.file}
              </Typography>
            </Container>
            <Button intent="ghost" icon="edit" size="sm" onClick={() => onEdit?.(agent)}>
              Edit raw .agent.md
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
