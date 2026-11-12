import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readOperatorMcpServers } from "./operator-mcp-servers";

describe("readOperatorMcpServers (A23)", () => {
  let home: string;
  const write = async (rel: string, json: unknown) => {
    await fs.mkdir(path.dirname(path.join(home, rel)), { recursive: true });
    await fs.writeFile(path.join(home, rel), JSON.stringify(json));
  };
  const loc = () => ({
    claudeDir: path.join(home, ".claude"),
    userConfigFile: path.join(home, ".claude.json"),
    repoRoot: "/repo",
  });

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "zibby-opmcp-"));
  });
  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it("returns user-scope + enabled plugins' servers, skipping disabled ones", async () => {
    const pluginRoot = path.join(home, "plugins", "pw");
    await write(".claude.json", {
      mcpServers: {
        serena: { type: "stdio", command: "serena", env: { TOKEN: "s3cret" } },
        design: { type: "http", url: "https://d.example/mcp" },
      },
      projects: { "/work": { disabledMcpServers: ["serena", "plugin:context7:context7"] } },
    });
    await write(".claude/settings.json", {
      enabledPlugins: { "playwright@x": true, "context7@x": true, "off@x": false },
    });
    await write(".claude/plugins/installed_plugins.json", {
      plugins: {
        "playwright@x": [{ installPath: pluginRoot }],
        "context7@x": [{ installPath: path.join(home, "plugins", "c7") }],
        "off@x": [{ installPath: path.join(home, "plugins", "off") }],
      },
    });
    await write("plugins/pw/.mcp.json", {
      playwright: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/server.js"] },
    });
    await write("plugins/c7/.mcp.json", {
      mcpServers: { context7: { type: "http", url: "https://c7" } },
    });
    await write("plugins/off/.mcp.json", { off: { command: "x" } });

    const all = await readOperatorMcpServers(loc());
    expect(all.map((s) => s.id)).toEqual([
      "serena",
      "design",
      "plugin_playwright_playwright",
      "plugin_context7_context7",
    ]);
    expect(all[0]?.config.env).toEqual({ TOKEN: "s3cret" });
    expect(all[2]?.config.args).toEqual([`${pluginRoot}/server.js`]);

    const inWork = await readOperatorMcpServers(loc(), "/work");
    expect(inWork.map((s) => s.id)).toEqual(["design", "plugin_playwright_playwright"]);
  });

  it("is empty (never throws) without any Claude config", async () => {
    expect(await readOperatorMcpServers(loc())).toEqual([]);
  });
});
