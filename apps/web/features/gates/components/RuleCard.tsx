import type { GateRule } from "@zibby/contracts";
import { Button, Card, Container, Icon, Stack, Typography } from "@zibby/design-system";
import { DECISION_META, MATCHER_ICON } from "../gate";
import { DecisionBadge, MatcherText, ResolveChips } from "./RuleParts";

export interface RuleCardProps {
  rule: GateRule;
  decisionLabel: string;
  andLabel: string;
  youLabel: string;
  notifyHint: string;
  /** Locked (inherited) system rules can't be edited or removed. */
  locked?: boolean;
  onDelete?: (id: string) => void;
}

/** One gate rule: matcher → decision (→ resolve, for `ask`). Left border = decision. */
export function RuleCard({
  rule,
  decisionLabel,
  andLabel,
  youLabel,
  notifyHint,
  locked = false,
  onDelete,
}: RuleCardProps) {
  const meta = DECISION_META[rule.decision];
  const matcherIcon = MATCHER_ICON[rule.match[0]?.type ?? "action"];
  return (
    <div style={{ borderLeft: `3px solid ${meta.cssVar}`, borderRadius: 2 }}>
      <Card background="panel" radius="sm">
        <Container padding="150">
          <Stack gap="100">
            <Stack align="center" direction="row" gap="100">
              <Icon name={locked ? "shield" : matcherIcon} size="sm" tone={locked ? "warn" : "faint"} />
              <Container grow minW0>
                <MatcherText andLabel={andLabel} match={rule.match} />
              </Container>
              {locked ? (
                <Icon name="link" size="xs" tone="faint" />
              ) : (
                onDelete && (
                  <Button aria-label="smazat pravidlo" icon="x" intent="ghost" onClick={() => onDelete(rule.id)} size="sm" />
                )
              )}
            </Stack>
            <Stack wrap align="center" direction="row" gap="100">
              <DecisionBadge decision={rule.decision} label={decisionLabel} />
              {rule.decision === "ask" && <ResolveChips resolve={rule.resolve} youLabel={youLabel} />}
              {rule.decision === "notify" && (
                <Typography mono size="2xs" type="note" variant="tertiary">
                  {notifyHint}
                </Typography>
              )}
            </Stack>
          </Stack>
        </Container>
      </Card>
    </div>
  );
}
