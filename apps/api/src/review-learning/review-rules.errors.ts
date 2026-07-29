/**
 * Raised when a scope key (a projectId, or {@link import("./review-rules.store").GLOBAL_SCOPE_KEY})
 * fails the filename-safe check before being turned into a path — defense in
 * depth against a caller-supplied id (e.g. containing `..` or `/`) escaping
 * the store's directory.
 */
export class InvalidReviewScopeKeyError extends Error {
  constructor(public readonly scopeKey: string) {
    super(`Invalid review-rules scope key: "${scopeKey}"`);
    this.name = "InvalidReviewScopeKeyError";
  }
}
