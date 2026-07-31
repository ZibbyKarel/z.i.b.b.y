/**
 * Who decides whether a failure is a refusal or a crash — and why that decision
 * had to stop being a string test.
 *
 * `logFailure` (cli.mjs) has exactly one thing to work out: print ONE clean
 * Czech line, or print a stack. One line is right for a failure the tool
 * anticipated and can name a remedy for; a stack is right for a genuine crash,
 * because then the stack IS the diagnostic. That decision used to be made by
 * `error.message.startsWith("design-match:")`.
 *
 * A message is not a fact this tool owns. Anything a throw passes through can
 * rewrite it — `page.evaluate: Error: design-match: …`,
 * `locator.screenshot: Protocol error …` — so the prefix test silently flipped
 * to `false` and a refusal printed as a crash. That happened SEVEN times on this
 * branch. Three of them were fixed by adding a translator at the call site that
 * raised it, and the seventh is what settled the argument: it is byte-for-byte
 * the Chromium refusal the third translator was written for, arriving through
 * `cropRegions`' `page.screenshot` instead of `locator.screenshot`. A mechanism
 * that has to be re-applied at every call site cannot cover the call site nobody
 * has written yet.
 *
 * ## Classification is by identity
 *
 * `DesignMatchError` is this tool's own refusal. No library can take that away
 * from an object by rewriting its message, which is the entire difference.
 * `compare-values.mjs`'s `design-match BUG:` marker stops being a one-keystroke
 * trap at the same time: a bug is a plain `Error`, a refusal is a
 * `DesignMatchError`, and the distinction is visible at the `throw` rather than
 * in the spelling of a string.
 *
 * ## Recognition happens once, at the boundary
 *
 * Playwright's own failures are still recognised by reading their messages —
 * there is no other handle on them. What changed is WHERE. `translatePlaywrightError`
 * below is the only place that reads them, and `withPage` (browser.mjs) is the
 * only place that calls it. That is not a convention anyone has to remember; it
 * is enforced by scope. A Playwright call needs a `browser`, a `page` or a
 * `locator`, this tool creates all three inside `withPage` and nowhere else
 * (`@playwright/test` is imported by browser.mjs alone), and `withPage` wraps its
 * whole callback. A new Playwright call site cannot be written outside the
 * boundary, because the objects it would need do not exist out there.
 *
 * Call sites keep one job, and it is deliberately NOT classification: they say
 * what they were doing (`describing`), so the sentence can name the region's box,
 * the page size or the caller's own remedy. No `matches` in `PLAYWRIGHT_FAILURES`
 * reads that annotation, so forgetting it costs detail in the message and cannot
 * cost the operator a stack. Instance eight belongs in `PLAYWRIGHT_FAILURES`
 * below — never at a fifth call site.
 */

/**
 * Every deliberate refusal this tool raises. The message convention (one Czech
 * sentence prefixed `design-match:`) is unchanged and still what the operator
 * sees; it is simply no longer what decides how the failure is printed.
 */
export class DesignMatchError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "DesignMatchError";
  }
}

/**
 * The prefix test survives as a FLOOR, not as the mechanism. Identity answers
 * first and answers correctly even when the message has been rewritten; the
 * prefix answers for a `design-match:` sentence raised somewhere that could not
 * construct the class (there is nowhere in this tool today — every refusal is a
 * `DesignMatchError`). Keeping it costs one `||` and means a missed migration
 * degrades to the old behaviour rather than to a stack.
 *
 * It cannot produce a false positive on a library's error either: no library
 * writes a message that starts with our prefix; the failure mode it had was
 * always the false NEGATIVE of a prefix that got pushed off the front.
 */
export function isDeliberateError(error) {
  if (error instanceof DesignMatchError) return true;
  return error instanceof Error && error.message.startsWith("design-match:");
}

/**
 * Non-enumerable so an untranslated crash's stack prints exactly as it did
 * before — `util.inspect` shows own enumerable symbols, and an operation record
 * bolted onto a stack trace would be noise at the one moment the stack is the
 * whole point.
 */
const OPERATION = Symbol("design-match.operation");

/**
 * "While doing X" — attached to whatever `run` throws, then rethrown untouched.
 *
 * This is context, not classification. The call site never decides whether a
 * failure is operator-caused; it only records what it was in the middle of, so
 * the boundary can name the url / selector / box in the sentence it builds. The
 * innermost annotation wins: an outer helper's description of the whole step is
 * less specific than the one attached beside the actual Playwright call.
 */
export async function describing(operation, run) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error && error[OPERATION] === undefined) {
      Object.defineProperty(error, OPERATION, { value: operation, configurable: true });
    }
    throw error;
  }
}

/** What `describing` recorded, or `{}` — an unannotated call site is a less detailed message, never a stack. */
export function operationOf(error) {
  if (!(error instanceof Error)) return {};
  return error[OPERATION] ?? {};
}

/**
 * Chromium refuses to photograph an area past its own capture limit and rejects
 * with `Protocol error (Page.captureScreenshot): Unable to capture screenshot`.
 * It arrives from `locator.screenshot` (one element too large) and from
 * `page.screenshot` (a document too large to render a full-page image of at
 * all) — the same browser fact through two APIs, which is precisely why
 * recognising it beside one of them was not enough.
 */
const UNCAPTURABLE_MESSAGE = "Unable to capture screenshot";

/** Chromium's network error codes, as Playwright surfaces them on a failed navigation. */
const NET_ERROR_RE = /net::(ERR_[A-Z0-9_]+)/;

/**
 * The url, recovered from the failure itself when no call site named it:
 * `page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:59999/impl.html`,
 * and `- navigating to "http://x/y", waiting until "load"` in a timeout's call log.
 */
const NAVIGATED_URL_RE = /\bat (https?:\/\/\S+)|navigating to "([^"]*)"/;

const navigatedUrl = (error, operation) => {
  if (operation.url !== undefined) return operation.url;
  const match = NAVIGATED_URL_RE.exec(error.message);
  return match?.[1] ?? match?.[2];
};

/**
 * Which Playwright API raised it. Every message this tool has observed is
 * prefixed with the call — `page.goto:`, `page.evaluate:`, `locator.all:`,
 * `locator.screenshot:`, `page.screenshot:` — and that prefix is the one thing
 * distinguishing a navigation timeout ("the page never loaded", an operator's
 * problem with a remedy) from a `locator.waitFor` timeout, which is not that
 * fact and keeps its stack.
 */
const NAVIGATION_TIMEOUT_PREFIX = "page.goto:";

/**
 * Both spellings of "that is not CSS", because both are reachable from the same
 * operator typo. `.sm:flex` reaches the browser and comes back as the DOM's own
 * `SyntaxError: Failed to execute 'querySelector' … is not a valid selector`;
 * `div[` is rejected by Playwright's own selector parser before the browser ever
 * sees it, as `Unexpected token "" while parsing css selector "div["`.
 */
const INVALID_SELECTOR_RE = /is not a valid selector|while parsing css selector/;
const INVALID_SELECTOR_NAME_RE =
  /'([^']*)' is not a valid selector|while parsing css selector "([^"]*)"/;

const px = (n) => Math.round(n);

/**
 * The closed set of operator-caused Playwright failures, in one table.
 *
 * Order matters only in that the first match wins; the four are disjoint on
 * every message observed.
 *
 * `matches` NEVER consults the operation. Recognition reads the failure alone,
 * so a call site that forgot to annotate still gets its clean line — which is
 * the whole property the per-call translators could not offer. `operation` only
 * enriches the sentence with facts the message does not carry (the region's box,
 * the page size, the caller's remedy); where it carries the same fact twice, the
 * annotation is preferred because it is authoritative and the message is a
 * library's formatting.
 */
const PLAYWRIGHT_FAILURES = [
  {
    name: "navigation-timeout",
    matches: (error) =>
      error.name === "TimeoutError" && error.message.startsWith(NAVIGATION_TIMEOUT_PREFIX),
    refuse: (error, operation) => {
      const url = navigatedUrl(error, operation);
      return new DesignMatchError(
        `design-match: stránku se nepodařilo načíst (událost load nenastala)${url ? ` — ${url}` : ""}. ` +
          `Ověř, že adresa odpovídá (u --route běží dev server? u --story běží Storybook?) a že se stránka otevře v prohlížeči. ` +
          `Pozn.: na požadavek, který nikdy neskončí — fetch s nepřečtenou odpovědí (větev pro 404) nebo polling — se už nečeká fatálně.`,
      );
    },
  },
  {
    name: "unreachable-origin",
    matches: (error) => NET_ERROR_RE.test(error.message),
    refuse: (error, operation) => {
      const code = NET_ERROR_RE.exec(error.message)[1];
      const url = navigatedUrl(error, operation);
      return new DesignMatchError(
        // The `net::` code is quoted rather than interpreted: the commonest one
        // by far is ERR_CONNECTION_REFUSED (the dev server is not running), but
        // the same rule catches ERR_NAME_NOT_RESOLVED, ERR_UNSAFE_PORT and the
        // rest, and inventing a cause for each would be four confident guesses.
        // The sentence says what the browser reported and what to check.
        `design-match: stránku se nepodařilo otevřít${url ? ` — ${url}` : ""} (${code}). ` +
          `Prohlížeč se na tu adresu nedostal: u --route musí běžet dev server, u --story Storybook. ` +
          `Ověř adresu i to, že se otevře v prohlížeči; jinou předáš přes --app-base / --storybook-base.`,
      );
    },
  },
  {
    name: "invalid-selector",
    matches: (error) => INVALID_SELECTOR_RE.test(error.message),
    refuse: (error, operation) => {
      const match = INVALID_SELECTOR_NAME_RE.exec(error.message);
      const selector = operation.selector ?? match?.[1] ?? match?.[2];
      return new DesignMatchError(
        `design-match: ${selector ? `selector "${selector}"` : "zadaný selector"} není platné CSS — prohlížeč ho odmítl rozparsovat. ` +
          `Oprav zápis (--selector, --mask): třídu s dvojtečkou, jak ji píše Tailwind (.sm:flex), je potřeba escapovat jako .sm\\:flex, ` +
          `nebo ji zapsat jako [class~="sm:flex"].`,
      );
    },
  },
  {
    name: "uncapturable",
    matches: (error) => error.message.includes(UNCAPTURABLE_MESSAGE),
    refuse: (_error, operation) => {
      // The preview shot is the whole page, not one element: what the browser
      // refused is the document, every candidate loses its crop at once, and the
      // inventory the operator would have chosen from never printed. Saying
      // "pick a smaller region" there would name a remedy the run has not put
      // them in a position to take.
      if (operation.kind === "preview") {
        const size = operation.pageSize
          ? ` o rozměrech ${px(operation.pageSize.width)}×${px(operation.pageSize.height)} px`
          : "";
        return new DesignMatchError(
          `design-match: náhledy regionů se nepodařilo vyfotit — prohlížeč odmítl snímek celé stránky${size}. ` +
            `Dokument mockupu je nad limitem snímkování v prohlížeči, takže z tohoto běhu nevznikl žádný náhled a inventura regionů se nevypsala. ` +
            `Zmenši stránku mockupu; bez snímku stránky se region nedá vybrat podle náhledu.`,
        );
      }
      const size = operation.box
        ? ` o rozměrech ${px(operation.box.w)}×${px(operation.box.h)} px na pozici (${px(operation.box.x)},${px(operation.box.y)})`
        : "";
      const named = operation.selector ? `region "${operation.selector}"` : "měřený region";
      return new DesignMatchError(
        `design-match: ${named} se nepodařilo vyfotit — prohlížeč odmítl snímek plochy${size}. ` +
          `Tak velký výřez je nad limitem snímkování v prohlížeči; není to chyba mockupu a menší výřez projde.${operation.remedy ?? ""}`,
      );
    },
  },
];

/**
 * The boundary's whole job: an operator-caused Playwright failure becomes a
 * `DesignMatchError` with one clean line; everything else is returned exactly as
 * it arrived, so a genuine crash still reaches `logFailure` with its stack.
 *
 * Our own refusals pass straight through — they are already the answer, and
 * re-reading their message here would be the string test coming back in through
 * the window.
 */
export function translatePlaywrightError(error) {
  if (!(error instanceof Error)) return error;
  if (isDeliberateError(error)) return error;
  const operation = operationOf(error);
  for (const failure of PLAYWRIGHT_FAILURES) {
    if (failure.matches(error, operation)) return failure.refuse(error, operation);
  }
  return error;
}
