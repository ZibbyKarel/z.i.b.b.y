import { homedir } from "node:os";
import { join } from "node:path";
import { installRoot } from "../shared/data-dir";

/** DI token for the {@link ClaudeLocations} the inventory scans. */
export const CLAUDE_LOCATIONS = "CLAUDE_LOCATIONS";

/** Where the operator's Claude Code keeps its config on this machine. */
export interface ClaudeLocations {
  /** `$CLAUDE_CONFIG_DIR`, else `~/.claude`. */
  claudeDir: string;
  /** `$CLAUDE_CONFIG_DIR/.claude.json`, else `~/.claude.json`. */
  userConfigFile: string;
  /** The ZIBBY install root — keys the `local` scope and holds the project `.mcp.json`. */
  repoRoot: string;
}

/** Resolve the locations from the environment (tests override the provider instead). */
export function resolveClaudeLocations(): ClaudeLocations {
  const override = process.env.CLAUDE_CONFIG_DIR || undefined;
  return {
    claudeDir: override ?? join(homedir(), ".claude"),
    userConfigFile: override ? join(override, ".claude.json") : join(homedir(), ".claude.json"),
    repoRoot: installRoot(),
  };
}
