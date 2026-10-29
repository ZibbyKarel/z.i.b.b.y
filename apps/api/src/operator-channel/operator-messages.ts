import type { OperatorChannelSettings, OperatorEventKind } from "@zibby/contracts";
import type { OperatorNotification } from "./operator-channel.port";
import type { OperatorEvent } from "./operator-events";

type Locale = OperatorChannelSettings["locale"];

/**
 * The operator channel's copy — the api's one catalog file (cs + en parity, cs is
 * the default). `en` is typed against `cs`, so a key missing on either side fails
 * to compile. `{title}` / `{n}` are the only placeholders.
 */
const cs = {
  headline: {
    "pr-opened": "PR otevřen: {title}",
    "review-finished": "Code review hotové, čeká na odeslání: {title}",
    "run-completed": "Hotovo: {title}",
    "approval-waiting": "Čeká na tvé rozhodnutí: {title}",
    "run-parked": "Běh zaparkován, potřebuje tě: {title}",
    "budget-cap": "Úloha zastavena na limitu rozpočtu: {title}",
    "ci-red": "CI je červené — opravuji: {title}",
    briefing: "Briefing: {title}",
    "autopilot-action": "Autopilot: {title}",
  } satisfies Record<OperatorEventKind, string>,
  coalesced: "{n} novinek",
  quietHours: "Tiché hodiny — posílám, protože to čeká na tebe.",
  openPr: "Otevřít PR",
  openInZibby: "Otevřít v ZIBBY",
  more: "… a další ({n})",
  test: "Testovací zpráva ze ZIBBY — kanál funguje.",
  chat: {
    thinking: "…",
    working: "Pracuji: {tool}…",
    run: "Úkol {taskId} · běh {runRef}",
    openRun: "Otevřít běh",
    yes: "Ano",
    no: "Ne",
    yesText: "Ano.",
    noText: "Ne.",
    answered: "→ {text}",
    truncated: "(Tvoje zpráva byla zkrácena na {n} znaků.)",
    perMinute: "Zpomalím — víc než {n} zpráv za minutu. Zkus to za chvíli.",
    perDay: "Dnešní limit {n} zpráv je vyčerpaný. Pokračuj prosím v ZIBBY.",
    busy: "Ještě zpracovávám předchozí zprávy — tuhle jsem nepřijal, pošli ji za chvíli.",
    error: "Něco se pokazilo: {message}",
    empty: "(bez odpovědi)",
  },
};

const en: typeof cs = {
  headline: {
    "pr-opened": "PR opened: {title}",
    "review-finished": "Code review done, waiting to be posted: {title}",
    "run-completed": "Done: {title}",
    "approval-waiting": "Waiting for your decision: {title}",
    "run-parked": "Run parked, needs you: {title}",
    "budget-cap": "Task held at the budget cap: {title}",
    "ci-red": "CI is red — fixing it: {title}",
    briefing: "Briefing: {title}",
    "autopilot-action": "Autopilot: {title}",
  },
  coalesced: "{n} updates",
  quietHours: "Quiet hours — sending because this waits on you.",
  openPr: "Open PR",
  openInZibby: "Open in ZIBBY",
  more: "… and {n} more",
  test: "Test message from ZIBBY — the channel works.",
  chat: {
    thinking: "…",
    working: "Working: {tool}…",
    run: "Task {taskId} · run {runRef}",
    openRun: "Open run",
    yes: "Yes",
    no: "No",
    yesText: "Yes.",
    noText: "No.",
    answered: "→ {text}",
    truncated: "(Your message was cut to {n} characters.)",
    perMinute: "Slowing down — more than {n} messages a minute. Try again in a moment.",
    perDay: "Today's limit of {n} messages is used up. Please continue in ZIBBY.",
    busy: "Still working on your earlier messages — this one wasn't taken, send it again shortly.",
    error: "Something went wrong: {message}",
    empty: "(no answer)",
  },
};

export const OPERATOR_MESSAGES: Record<Locale, typeof cs> = { cs, en };

/** Max context lines a coalesced message lists before "… and N more". */
const MAX_LINES = 5;
/** Slack truncates long sections; keep each context line short. */
const MAX_LINE = 280;

export const fill = (tpl: string, vars: Record<string, string | number>): string =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** Slack mrkdwn control characters — inbound-derived text must never form a link/mention. */
export const escapeMrkdwn = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const clip = (s: string): string => (s.length > MAX_LINE ? `${s.slice(0, MAX_LINE - 1)}…` : s);

export function zibbyLink(base: string | undefined, path: string | undefined): string | null {
  if (!base || !path) return null;
  return `${base.replace(/\/+$/, "")}${path}`;
}

/**
 * Build the notification for a flushed batch: one event → its headline, detail and
 * link buttons; several → one coalesced message listing them (each line linking its
 * PR when it has one). `quiet` flags a Tier-3 message breaking through quiet hours.
 */
export function buildNotification(
  events: OperatorEvent[],
  settings: Pick<OperatorChannelSettings, "locale" | "publicBaseUrl">,
  quiet: boolean,
): OperatorNotification {
  const m = OPERATOR_MESSAGES[settings.locale];
  const headlineOf = (e: OperatorEvent): string =>
    fill(m.headline[e.kind], { title: escapeMrkdwn(clip(e.title)) });
  const flag = quiet ? [m.quietHours] : [];
  const tier = events.some((e) => e.tier === 3) ? 3 : 2;
  const [only] = events;

  if (only && events.length === 1) {
    const links: OperatorNotification["links"] = [];
    if (only.prUrl) links.push({ label: m.openPr, url: only.prUrl });
    const zibby = zibbyLink(settings.publicBaseUrl, only.path);
    if (zibby) links.push({ label: m.openInZibby, url: zibby });
    return {
      kind: only.kind,
      tier,
      headline: headlineOf(only),
      lines: [...flag, ...(only.detail ? [escapeMrkdwn(clip(only.detail))] : [])],
      links,
    };
  }

  const shown = events.slice(0, MAX_LINES).map((e) => {
    const line = headlineOf(e);
    return e.prUrl ? `• <${e.prUrl}|${line}>` : `• ${line}`;
  });
  const rest = events.length - shown.length;
  const zibby = zibbyLink(settings.publicBaseUrl, "/dashboard");
  return {
    kind: events[0]?.kind ?? "run-completed",
    tier,
    headline: fill(m.coalesced, { n: events.length }),
    lines: [...flag, ...shown, ...(rest > 0 ? [fill(m.more, { n: rest })] : [])],
    links: zibby ? [{ label: m.openInZibby, url: zibby }] : [],
  };
}

/** The `POST /api/operator-channel/test` message. */
export function buildTestNotification(
  settings: Pick<OperatorChannelSettings, "locale" | "publicBaseUrl">,
): OperatorNotification {
  const m = OPERATOR_MESSAGES[settings.locale];
  const zibby = zibbyLink(settings.publicBaseUrl, "/dashboard");
  return {
    kind: "test",
    tier: 2,
    headline: m.test,
    lines: [],
    links: zibby ? [{ label: m.openInZibby, url: zibby }] : [],
  };
}
