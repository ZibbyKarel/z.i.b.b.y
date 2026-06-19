/** Raised when an MCP server file does not exist for the requested id. */
export class McpServerNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`MCP server "${id}" not found`);
    this.name = "McpServerNotFoundError";
  }
}

/** Raised when creating an MCP server whose id is already taken. */
export class McpServerConflictError extends Error {
  constructor(public readonly id: string) {
    super(`MCP server "${id}" already exists`);
    this.name = "McpServerConflictError";
  }
}

/** Raised when an id is unsafe to use as a file name (e.g. path traversal). */
export class InvalidMcpServerIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid MCP server id: "${id}"`);
    this.name = "InvalidMcpServerIdError";
  }
}
