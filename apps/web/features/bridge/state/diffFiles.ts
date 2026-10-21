export interface DiffFile {
  path: string;
  added: number;
  removed: number;
}

/** Per-file `+/-` counts of a unified diff (`diff --git a/x b/x` sections). */
export function diffFiles(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;
  let inHunk = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      cur = { path: m?.[2] ?? line.slice(11), added: 0, removed: 0 };
      files.push(cur);
      inHunk = false;
    } else if (cur && line.startsWith("@@")) inHunk = true;
    else if (cur && inHunk) {
      if (line.startsWith("+")) cur.added++;
      else if (line.startsWith("-")) cur.removed++;
    }
  }
  return files;
}
