import type { MessageKeys, Messages, NestedKeyOf } from "next-intl";

/**
 * Any valid full-path message key (e.g. `"limits.rollingLabel"`), validated
 * against the augmented `Messages` type declared in `global.d.ts`.
 *
 * Use it to type data fields that carry a catalog key resolved later with the
 * root-scoped `t()` — the compiler then rejects typos and dead keys at the
 * point the key is stored, not just at the `t()` call site.
 */
export type MessageKey = MessageKeys<Messages, NestedKeyOf<Messages>>;
