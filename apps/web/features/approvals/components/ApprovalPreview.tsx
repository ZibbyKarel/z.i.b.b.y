import {
  CodeBlock,
  Container,
  Divider,
  Icon,
  type IconName,
  Panel,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { ReactNode } from "react";
import type { ApprovalPreview as Preview } from "../approval";

const MONO = "var(--font-mono, ui-monospace, monospace)";

/** Framed preview surface with a header bar — the shell every preview kind shares. */
function PreviewShell({
  icon,
  label,
  meta,
  children,
}: {
  icon: IconName;
  label: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <Panel
      header={
        <Stack align="center" direction="row" gap="75">
          <Icon name={icon} size="sm" tone="accent" />
          <Typography mono size="xs" type="note" weight="semibold">
            {label}
          </Typography>
        </Stack>
      }
      headerEnd={
        meta ? (
          <Typography mono size="2xs" type="note" variant="tertiary">
            {meta}
          </Typography>
        ) : undefined
      }
    >
      {children}
    </Panel>
  );
}

const DIFF_KIND = {
  add: { color: "var(--color-ok)", bg: "rgba(127,217,138,0.09)", sign: "+" },
  del: { color: "var(--color-bad)", bg: "rgba(255,107,107,0.09)", sign: "−" },
  ctx: { color: "var(--color-foreground-dim)", bg: "transparent", sign: " " },
} as const;

export interface ApprovalPreviewProps {
  preview: Preview;
  /** Localized "total to pay" / "delete targets" captions. */
  labels: { cart: string; total: string; targets: string; sendTo: string };
}

/** Renders the exact action an agent is about to take, by preview kind. */
export function ApprovalPreview({ preview, labels }: ApprovalPreviewProps) {
  if (preview.kind === "cart") {
    return (
      <PreviewShell icon="cart" label={labels.cart} meta={preview.meta}>
        <div>
          {preview.items.map(([name, price], i) => (
            <div key={i}>
              <Container padding={["100", "150"]}>
                <Stack direction="row" gap="150" justify="between">
                  <Typography
                    size="sm"
                    type="text"
                    variant={name.startsWith("+") ? "tertiary" : "secondary"}
                  >
                    {name}
                  </Typography>
                  <Typography mono size="sm" type="note">
                    {price}
                  </Typography>
                </Stack>
              </Container>
              <Divider />
            </div>
          ))}
        </div>
        {/* eslint-disable-next-line react/forbid-dom-props */}
        <div style={{ background: "rgba(240,180,41,0.06)" }}>
          <Container padding={["150", "150"]}>
            <Stack align="baseline" direction="row" justify="between">
              <Typography
                mono
                uppercase
                size="xs"
                type="note"
                variant="secondary"
              >
                {labels.total}
              </Typography>
              <Typography mono size="lg" tone="warn" type="note" weight="bold">
                {preview.total}
              </Typography>
            </Stack>
          </Container>
        </div>
      </PreviewShell>
    );
  }

  if (preview.kind === "diff") {
    return (
      <PreviewShell icon="branch" label={preview.file} meta={preview.meta}>
        {preview.hunks.map((hunk, hi) => (
          <div key={hi}>
            {}
            {/* eslint-disable-next-line react/forbid-dom-props */}
            <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--color-accent)", background: "var(--color-accent-dim)" }}>
              <Container padding={["75", "150"]}>{hunk.h}</Container>
            </div>
            <Divider />
            {hunk.lines.map(([kind, text], i) => {
              const m = DIFF_KIND[kind];
              return (
                // eslint-disable-next-line react/forbid-dom-props
                <div key={i} style={{ background: m.bg }}>
                  <Stack direction="row">
                    <Container
                      shrink={false}
                      textAlign="center"
                      userSelect="none"
                      width="22px"
                    >
                      {}
                      {/* eslint-disable-next-line react/forbid-dom-props */}
                      <span style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.7, color: m.color, opacity: 0.7 }}>
                        {m.sign}
                      </span>
                    </Container>
                    {}
                    {/* eslint-disable-next-line react/forbid-dom-props */}
                    <span style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.7, color: kind === "ctx" ? "var(--color-foreground-dim)" : m.color, whiteSpace: "pre", paddingRight: "0.8rem" }}>
                      {text || " "}
                    </span>
                  </Stack>
                </div>
              );
            })}
          </div>
        ))}
      </PreviewShell>
    );
  }

  if (preview.kind === "command") {
    return (
      <PreviewShell
        icon="server"
        label={`${preview.shell}`}
        meta={preview.note}
      >
        <CodeBlock text={`$ ${preview.cmd}`} />
        <Divider />
        <Container padding={["100", "150"]}>
          <Typography mono uppercase size="2xs" type="note" variant="tertiary">
            {labels.targets}
          </Typography>
          <Container padding={["75", "0", "0", "0"]}>
            <Stack direction="col" gap="50">
              {preview.targets.map((t, i) => (
                <Stack align="center" direction="row" gap="100" key={i}>
                  <Icon name="x" size="xs" tone="bad" />
                  <Typography
                    mono
                    size="xs"
                    type="note"
                    variant={t.startsWith("…") ? "tertiary" : "secondary"}
                  >
                    {t}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Container>
        </Container>
      </PreviewShell>
    );
  }

  // message
  return (
    <PreviewShell
      icon="arrow"
      label={`${labels.sendTo} ${preview.to}`}
      meta={preview.subject}
    >
      <Container padding={["150", "200"]}>
        <Typography
          leading="relaxed"
          size="base"
          style={{ whiteSpace: "pre-wrap" }}
          type="text"
        >
          {preview.body}
        </Typography>
      </Container>
    </PreviewShell>
  );
}
