// Run vision judges over the same finished book's pages, the way produce calls them.
// Rejected pages were un-approved by the book-level audit, so a good judge fails them.
// node --no-warnings scripts/compare-judges.ts <book-dir> [judgeA,judgeB,...] [maxRejected]
// A judge is a provider id, optionally with an LM Studio model: lmstudio:qwen/qwen3.6-27b
import fs from "node:fs";
import path from "node:path";
import { createVisionProvider } from "../src/providers/index.ts";
import type { VisionInput, VisionVerdict } from "../src/providers/vision.ts";

const [
  bookDir = "",
  judges = "lmstudio:qwen/qwen3-vl-8b,lmstudio:qwen/qwen3.6-27b",
  maxRej = "24",
] = process.argv.slice(2);
const read = (f: string): unknown => JSON.parse(fs.readFileSync(path.join(bookDir, f), "utf8"));
const plan = read("plan.json") as {
  styleGuide: string;
  characters: { id: string; label: string; spec: string }[];
  pages: { pageNumber: number; subjects: string[]; characters: string[] }[];
};
const jobs = (read("jobs.json") as { jobs: { pageNumber: number; prompt: string }[] }).jobs;

const approved: VisionInput[] = [];
const rejected: VisionInput[] = [];
for (const p of plan.pages) {
  const dir = path.join(bookDir, "illustrations", String(p.pageNumber).padStart(2, "0"));
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((f) => /-(approved|rejected-\d+)\.png$/.test(f)))
    (f.includes("approved") ? approved : rejected).push({
      file: path.join(dir, f),
      pageNumber: p.pageNumber,
      expectedSubjects: p.subjects,
      styleGuide: plan.styleGuide,
      ...(p.characters.length > 0
        ? {
            characters: p.characters.map((id) => plan.characters.find((c) => c.id === id)!),
            scene: jobs.find((j) => j.pageNumber === p.pageNumber)?.prompt ?? "",
            referenceImage: path.join(bookDir, "characters", `cast-${p.characters.join("+")}.png`),
          }
        : {}),
    });
}
const inputs = [...approved, ...rejected.slice(0, Number(maxRej))];

const results: Record<string, VisionVerdict[]> = {};
for (const id of judges.split(",")) {
  const [provider = "", model] = id.split(/:(.*)/);
  const v = createVisionProvider({
    ...process.env,
    PF_VISION_PROVIDER: provider,
    ...(model ? { PF_LMSTUDIO_MODEL: model } : {}),
  });
  if (!v) continue;
  results[id] = [];
  for (const [i, input] of inputs.entries()) {
    const r = await v.judge(input);
    results[id].push(r);
    console.error(
      `${id} ${i + 1}/${inputs.length} ${path.basename(input.file)} ${r.passed} ${r.durationMs}ms`,
    );
  }
  await v.dispose?.(); // models never overlap in memory
}

const ids = Object.keys(results);
const issueTypes = (r: VisionVerdict | undefined) => r?.issues.map((i) => i.type).join(",") || "-";
const stat = (rs: VisionVerdict[]) => {
  const ms = rs.map((r) => r.durationMs).sort((x, y) => x - y);
  const caught = rs.slice(approved.length).filter((r) => !r.passed).length;
  const kept = rs.slice(0, approved.length).filter((r) => r.passed).length;
  return `approved kept ${kept}/${approved.length}, rejected caught ${caught}/${rs.length - approved.length}, judge-error ${rs.filter((r) => r.issues.some((i) => i.type === "judge-error")).length}, median ${((ms[ms.length >> 1] ?? 0) / 1000).toFixed(1)} s, total ${(ms.reduce((s, x) => s + x, 0) / 1000).toFixed(0)} s`;
};
console.log(
  [
    `# Judge comparison: ${ids.join(" vs ")}`,
    "",
    `Book: ${bookDir} — ${approved.length} approved + ${inputs.length - approved.length} rejected pages`,
    "",
    ...ids.map((id) => `- ${id}: ${stat(results[id] ?? [])}`),
    "",
    `| image | ${ids.join(" | ")} |`,
    `|---|${ids.map(() => "---|").join("")}`,
    ...inputs.map(
      (inp, i) =>
        `| ${path.basename(inp.file)} | ${ids
          .map((id) => {
            const r = results[id]?.[i];
            return `${r?.passed ? "pass" : "fail"} (${issueTypes(r)})`;
          })
          .join(" | ")} |`,
    ),
  ].join("\n"),
);
