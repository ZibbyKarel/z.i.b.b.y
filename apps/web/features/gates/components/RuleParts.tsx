import { Fragment } from "react";
import type { Decision, MatchCondition, Resolve } from "@zibby/contracts";
import { Badge, Icon, Typography } from "@zibby/design-system";
import { DECISION_META, flattenResolve, matchText } from "../gate";

const MONO = "var(--font-mono, ui-monospace, monospace)";

export function DecisionBadge({ decision, label, size = "sm" }: { decision: Decision; label: string; size?: "sm" | "md" }) {
  const meta = DECISION_META[decision];
  return (
    <Badge size={size} tone={meta.tone}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
        <Icon name={meta.icon} size="xs" />
        {label}
      </span>
    </Badge>
  );
}

/** A highlighted match-pattern chip (the emphasized argument/target). */
function Pat({ children }: { children: string }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--color-accent)",
        background: "var(--color-accent-dim)",
        border: "1px solid var(--color-border)",
        borderRadius: 2,
        padding: "1px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Render the rule's AND-ed match conditions as human-readable text. */
export function MatcherText({ match, andLabel }: { match: MatchCondition[]; andLabel: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", lineHeight: 1.5 }}>
      {match.map((c, i) => {
        const { lead, pattern } = matchText(c);
        return (
          <Fragment key={i}>
            {i > 0 && (
              <Typography mono size="2xs" type="note" variant="tertiary" weight="bold">
                {andLabel}
              </Typography>
            )}
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
              <Typography mono size="sm" type="note" variant="secondary">
                {lead}
              </Typography>
              {pattern && (
                <>
                  <span style={{ color: "var(--color-foreground-faint)" }}>→</span>
                  <Pat>{pattern}</Pat>
                </>
              )}
            </span>
          </Fragment>
        );
      })}
    </span>
  );
}

/** Resolution chips (only meaningful for `ask`): human / check / agent, AND/OR-combined. */
export function ResolveChips({ resolve, youLabel }: { resolve: Resolve | undefined; youLabel: string }) {
  const { leaves, mode } = flattenResolve(resolve);
  if (leaves.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
      {leaves.map((leaf, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <Typography mono size="2xs" type="note" variant="tertiary" weight="bold">
              {mode === "all" ? "AND" : "OR"}
            </Typography>
          )}
          <Badge size="sm" tone={leaf.kind === "check" ? "ok" : leaf.kind === "agent" ? "accent" : "neutral"}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
              <Icon name={leaf.kind === "agent" ? "bot" : leaf.kind === "check" ? "check" : "shield"} size="xs" />
              {leaf.kind === "human" ? youLabel : leaf.name}
            </span>
          </Badge>
        </Fragment>
      ))}
    </span>
  );
}
