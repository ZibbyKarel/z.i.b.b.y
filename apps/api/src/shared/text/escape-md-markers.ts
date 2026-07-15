/**
 * Neutralize the literal HTML-comment delimiters (`<!--` / `-->`) that the
 * self-knowledge composer's own `<!-- AUTO:<KEY>:START/END -->` block markers
 * depend on (`self-knowledge.composer.ts`'s `blockRegex`/`mergeAutoBlocks`/
 * `extractBlockContent`). Catalog-entity free-text (agent/pipeline/subsystem
 * names, descriptions, mandates, gate-rule names, channel kinds) is
 * interpolated into that markdown verbatim; a forged
 * `<!-- AUTO:GATES:END -->` inside one of those strings could prematurely
 * close (or fabricate) an AUTO block — a confused-deputy MD-injection against
 * a note ZIBBY itself may read back.
 *
 * This is deliberately narrow: it defangs only the two character sequences
 * this one sink's parsing depends on, via lookalike Unicode characters
 * (mirrors `sanitizeInbound`'s defang style in `shared/text/untrusted-envelope.ts`
 * — preserves human readability, makes the string structurally inert against
 * the block-boundary regex, without deleting content). It is NOT a general
 * markdown escaper: headings (`#`), list bullets (`- `), wikilinks (`[[`),
 * backticks, and frontmatter (`---`) are intentionally left alone — see
 * `.superpowers/sdd/task-4-scope.md` §4 for why (the composer's own scaffold
 * must stay live, and generic markdown chars in an entity string just render
 * as harmless markdown, unlike the machine-parsed marker sequence).
 */
export function escapeAutoBoundaryMarkers(text: string): string {
  return text.replace(/<!--/g, "‹!--").replace(/-->/g, "--›");
}
