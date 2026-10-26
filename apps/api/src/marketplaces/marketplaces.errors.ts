/** Raised when ZIBBY's record has no marketplace with the requested id. */
export class MarketplaceNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Marketplace "${id}" not found`);
    this.name = "MarketplaceNotFoundError";
  }
}

/** Raised when a marketplace has no such plugin (or it is not installed, for uninstall). */
export class MarketplacePluginNotFoundError extends Error {
  constructor(
    public readonly id: string,
    public readonly plugin: string,
    detail = "not found",
  ) {
    super(`Plugin "${plugin}" of marketplace "${id}" ${detail}`);
    this.name = "MarketplacePluginNotFoundError";
  }
}

/** Raised when connecting a marketplace whose id ZIBBY's record already has. */
export class MarketplaceConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Marketplace "${id}" is already connected`);
    this.name = "MarketplaceConflictError";
  }
}

/** Raised when the add-input source cannot be used (bad path, no marketplace.json, …). */
export class InvalidMarketplaceSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMarketplaceSourceError";
  }
}

/** A `claude`/`git` child failed; `message` is its trimmed stderr. */
export class MarketplaceCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketplaceCliError";
  }
}

/** A filesystem guard refused a path outside the directory it may touch. */
export class UnsafeMarketplacePathError extends Error {
  constructor(
    public readonly target: string,
    public readonly root: string,
  ) {
    super(`Refusing to modify "${target}": outside "${root}"`);
    this.name = "UnsafeMarketplacePathError";
  }
}

/** Raised when installing a plugin that is already installed (normal mode). */
export class MarketplacePluginInstalledError extends Error {
  constructor(
    public readonly id: string,
    public readonly plugin: string,
  ) {
    super(`Plugin "${plugin}" of marketplace "${id}" is already installed`);
    this.name = "MarketplacePluginInstalledError";
  }
}
