import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { GateRulesStorageService } from "../gate-rules/gate-rules.storage.service";
import { PolicyStorageService } from "../gates/policy.storage.service";
import { VaultService } from "../memory/vault.service";
import { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import { SELF_KNOWLEDGE_NOTE_ID, SelfKnowledgeService } from "./self-knowledge.service";

/** Build a fully-wired service over fresh temp dirs (mirrors the storage services' own tests). */
async function makeService(): Promise<{ dir: string; service: SelfKnowledgeService }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "self-knowledge-"));

  const agents = new AgentsStorageService(path.join(dir, "agents"));
  await agents.onModuleInit();
  const pipelines = new PipelinesStorageService(path.join(dir, "pipelines"));
  await pipelines.onModuleInit();
  const gateRules = new GateRulesStorageService(path.join(dir, "gate-rules"));
  await gateRules.onModuleInit();
  const policy = new PolicyStorageService(path.join(dir, "policy"));
  await policy.onModuleInit();
  const vault = new VaultService(path.join(dir, "vault"));
  await vault.onModuleInit();

  return { dir, service: new SelfKnowledgeService(agents, pipelines, gateRules, policy, vault) };
}

describe("SelfKnowledgeService", () => {
  let dir: string;
  let service: SelfKnowledgeService;

  beforeEach(async () => {
    ({ dir, service } = await makeService());
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe("compose", () => {
    it("reflects the live agents/pipelines/gate-rules/policy catalog", async () => {
      await new AgentsStorageService(path.join(dir, "agents")).create({
        id: "koder",
        instructions: "Write code.",
      });

      const result = await service.compose();

      expect(result.sections.agents).toBe(1);
      // The seeded default catalog + floor are non-empty (see the storage services).
      expect(result.sections.gateRules).toBeGreaterThan(0);
      expect(result.sections.channels).toBeGreaterThan(0);
      expect(result.markdown).toContain("koder");
      expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
    });

    it("reports drift when there is no vault note yet", async () => {
      const result = await service.compose();
      expect(result.drift).toBe(true);
    });

    it("reports no drift right after write()", async () => {
      await service.write();
      const result = await service.compose();
      expect(result.drift).toBe(false);
    });

    it("picks up a new agent added directly to disk (hot-reload — Zjištění 2)", async () => {
      await service.write();
      expect((await service.compose()).drift).toBe(false);

      // Simulate an externally-added agent file, bypassing this process entirely.
      await new AgentsStorageService(path.join(dir, "agents")).create({
        id: "new-agent",
        instructions: "Fresh off the disk.",
      });

      const result = await service.compose();
      expect(result.sections.agents).toBe(1);
      expect(result.drift).toBe(true);
    });
  });

  describe("write", () => {
    it("creates the note on first write", async () => {
      const note = await service.write();
      expect(note.id).toBe(SELF_KNOWLEDGE_NOTE_ID);
      expect(note.tier).toBe("knowledge");
      expect(note.title).toBe("Self-Knowledge");
    });

    it("merges into an existing note, preserving operator content outside AUTO blocks", async () => {
      const vault = new VaultService(path.join(dir, "vault"));
      await vault.onModuleInit();
      await vault.createNote({
        id: SELF_KNOWLEDGE_NOTE_ID,
        tier: "knowledge",
        title: "Self-Knowledge",
        body: [
          "# Self-Knowledge",
          "",
          "Operator note: keep this.",
          "",
          "<!-- AUTO:META:START -->",
          "_Generated: 2020-01-01T00:00:00.000Z_",
          "<!-- AUTO:META:END -->",
        ].join("\n"),
      });

      const note = await service.write();

      expect(note.body).toContain("Operator note: keep this.");
      expect(note.body).toContain("<!-- AUTO:AGENTS:START -->");
    });

    it("is idempotent: writing twice with no catalog change yields no drift", async () => {
      await service.write();
      await service.write();
      expect(await service.check()).toBe(false);
    });
  });

  describe("check", () => {
    it("returns true before the note exists, false right after write()", async () => {
      expect(await service.check()).toBe(true);
      await service.write();
      expect(await service.check()).toBe(false);
    });
  });
});
