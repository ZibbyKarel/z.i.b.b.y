import fs from "node:fs";

/** Parse an agent-written artifact: raw JSON, or the FIRST fenced ```json block of a markdown file. */
export function readJsonArtifact(file: string): unknown {
  const text = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    // not raw JSON — fall through to the fenced block
  }
  const m = /```json[^\n]*\n([\s\S]*?)```/i.exec(text);
  if (!m) throw new Error(`${file}: not valid JSON and contains no fenced \`\`\`json block`);
  try {
    return JSON.parse(m[1] ?? "");
  } catch (e) {
    throw new Error(
      `${file}: the first \`\`\`json block is not valid JSON (${(e as Error).message})`,
    );
  }
}
