import type { GlobalGateRule } from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";
import {
  Button,
  Card,
  Container,
  Divider,
  Icon,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { DECISION_META, MATCHER_ICON } from "../gate";
import { DecisionBadge, MatcherText, ResolveChips } from "./RuleParts";

/** A catalog rule's consumer (an agent or a skill that links it via `gateRuleIds`). */
export interface RuleUser {
  id: string;
  name: string;
  glyph: IconName;
}

export interface GlobalRuleCardProps {
  rule: GlobalGateRule;
  /** Agents that link this rule (computed from each agent's `gateRuleIds`). */
  agents: RuleUser[];
  /** Skills that link this rule. */
  skills: RuleUser[];
  /** Reorder is hidden while a decision filter is active (visual order ≠ eval order). */
  canReorder: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onEdit: (rule: GlobalGateRule) => void;
  onDelete: (id: string) => void;
}

/** A chip naming one agent/skill that uses the rule. */
function UserChip({ user }: { user: RuleUser }) {
  return (
    <Tag tone="neutral">
      <Stack inline align="center" as="span" direction="row" gap="50">
        <Icon name={user.glyph} size="xs" tone="accent" />
        {user.name}
      </Stack>
    </Tag>
  );
}

/**
 * One global gate rule in the catalog: matcher → decision (→ resolve, for `ask`),
 * an optional name/description, a usage strip (which agents/skills link it) and the
 * row actions (reorder up/down, edit, delete). The left border encodes the decision.
 */
export function GlobalRuleCard({
  rule,
  agents,
  skills,
  canReorder,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: GlobalRuleCardProps) {
  const t = useTranslations("gates");
  const meta = DECISION_META[rule.decision];
  const matcherIcon = MATCHER_ICON[rule.match[0]?.type ?? "action"];
  const total = agents.length + skills.length;

  return (
    // eslint-disable-next-line react/forbid-dom-props
    <div style={{ borderLeft: `3px solid ${meta.cssVar}`, borderRadius: 2 }}>
      <Card background="panel" radius="sm">
        <Container padding="150">
          <Stack gap="100">
            <Stack align="start" direction="row" gap="100">
              <Icon name={matcherIcon} size="sm" tone="faint" />
              <Container grow minW0>
                <Stack gap="50">
                  {rule.name && (
                    <Typography size="sm" type="text" weight="semibold">
                      {rule.name}
                    </Typography>
                  )}
                  <Stack wrap align="center" direction="row" gap="100">
                    <MatcherText andLabel={t("and")} match={rule.match} />
                    <Typography mono size="2xs" type="note" variant="tertiary">
                      →
                    </Typography>
                    <DecisionBadge
                      decision={rule.decision}
                      label={t(`decision_.${rule.decision}`)}
                    />
                    {rule.decision === "ask" && (
                      <ResolveChips
                        resolve={rule.resolve}
                        youLabel={t("you")}
                      />
                    )}
                    {rule.decision === "notify" && (
                      <Typography
                        mono
                        size="2xs"
                        type="note"
                        variant="tertiary"
                      >
                        {t("notifyHint")}
                      </Typography>
                    )}
                  </Stack>
                  {rule.desc && (
                    <Typography size="xs" type="note" variant="tertiary">
                      {rule.desc}
                    </Typography>
                  )}
                </Stack>
              </Container>

              <Stack align="center" direction="row" gap="50">
                {total > 0 ? (
                  <Tag tone="accent">
                    <Stack
                      inline
                      align="center"
                      as="span"
                      direction="row"
                      gap="50"
                    >
                      <Icon name="bot" size="xs" />
                      {total}
                    </Stack>
                  </Tag>
                ) : (
                  <Typography mono size="2xs" type="note" variant="tertiary">
                    {t("unused")}
                  </Typography>
                )}
                {canReorder && (
                  <>
                    <Button
                      aria-label={t("moveUp")}
                      disabled={isFirst}
                      intent="ghost"
                      onClick={() => onMoveUp(rule.id)}
                      size="sm"
                    >
                      ↑
                    </Button>
                    <Button
                      aria-label={t("moveDown")}
                      disabled={isLast}
                      intent="ghost"
                      onClick={() => onMoveDown(rule.id)}
                      size="sm"
                    >
                      ↓
                    </Button>
                  </>
                )}
                <Button
                  aria-label={t("edit")}
                  icon="edit"
                  intent="ghost"
                  onClick={() => onEdit(rule)}
                  size="sm"
                />
                <Button
                  aria-label={t("delete")}
                  icon="x"
                  intent="ghost"
                  onClick={() => onDelete(rule.id)}
                  size="sm"
                />
              </Stack>
            </Stack>

            {total > 0 && (
              <>
                <Divider />
                <Stack wrap align="center" direction="row" gap="100">
                  {agents.length > 0 && (
                    <Stack
                      inline
                      align="center"
                      as="span"
                      direction="row"
                      gap="75"
                    >
                      <Typography
                        mono
                        size="2xs"
                        type="note"
                        variant="tertiary"
                      >
                        {t("usedByAgents")}
                      </Typography>
                      {agents.map((a) => (
                        <UserChip key={a.id} user={a} />
                      ))}
                    </Stack>
                  )}
                  {skills.length > 0 && (
                    <Stack
                      inline
                      align="center"
                      as="span"
                      direction="row"
                      gap="75"
                    >
                      <Typography
                        mono
                        size="2xs"
                        type="note"
                        variant="tertiary"
                      >
                        {t("usedBySkills")}
                      </Typography>
                      {skills.map((s) => (
                        <UserChip key={s.id} user={s} />
                      ))}
                    </Stack>
                  )}
                </Stack>
              </>
            )}
          </Stack>
        </Container>
      </Card>
    </div>
  );
}
