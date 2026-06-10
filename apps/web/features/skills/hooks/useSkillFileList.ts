"use client";

import { useState } from "react";

/** Extensions the directory tab ingests — `.md` often carries an empty MIME type,
 *  so accepted files are matched by name, never by the browser's content type. */
const MD_EXTENSIONS = /\.(md|markdown|txt)$/i;

/** A skill's content can be merged from many files; the design joins them with a
 *  horizontal rule so the boundaries survive in the editor. */
const MERGE_SEPARATOR = "\n\n---\n\n";

/** A file read from a dropped folder, awaiting selection before import. */
export interface LoadedFile {
  /** Relative path within the dropped folder (`webkitRelativePath`-style). */
  path: string;
  name: string;
  content: string;
  size: number;
  checked: boolean;
}

/** react-dropzone tags each `File` with its in-folder path; the base `File` type doesn't. */
type FileWithPath = File & { path?: string };

/**
 * The dropped-files side of the "add skill" flow: ingest a dropped folder
 * (Markdown-ish files only, sorted by path), toggle per-file selection, and
 * merge the checked files into one editor body. Pure state — what to do with
 * the merged text is the caller's business.
 */
export function useSkillFileList() {
  const [files, setFiles] = useState<LoadedFile[]>([]);

  /** Read dropped files, keep only Markdown-ish ones, sort by path. Dropping a
   *  folder makes react-dropzone walk its subfolders, so this handles directories. */
  const handleDrop = (accepted: File[]) => {
    const mdFiles = accepted.filter((f) => MD_EXTENSIONS.test(f.name));
    if (mdFiles.length === 0) return;
    void Promise.all(
      mdFiles.map(async (f): Promise<LoadedFile> => {
        const path = (f as FileWithPath).path?.replace(/^\.?\//, "") ?? f.name;
        return { path, name: f.name, content: await f.text(), size: f.size, checked: true };
      }),
    ).then((loaded) => setFiles(loaded.sort((a, b) => a.path.localeCompare(b.path))));
  };

  const toggleFile = (path: string) =>
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, checked: !f.checked } : f)));

  const selectedCount = files.filter((f) => f.checked).length;

  /** The checked files' contents joined with the merge separator ("" when none). */
  const mergeSelected = () =>
    files
      .filter((f) => f.checked)
      .map((f) => f.content)
      .join(MERGE_SEPARATOR);

  return { files, selectedCount, handleDrop, toggleFile, mergeSelected };
}
