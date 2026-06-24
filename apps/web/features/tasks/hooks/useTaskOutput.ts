import type { TaskOutput } from "@zibby/contracts";
import { useMemo, useState } from "react";

export type OutputType = "" | "pr" | "file" | "void";
export type FileDest = "project" | "vault";

export interface UseTaskOutput {
  outputType: OutputType;
  setOutputType: (type: OutputType) => void;
  fileDest: FileDest;
  setFileDest: (dest: FileDest) => void;
  fileTo: string;
  setFileTo: (to: string) => void;
  /** The wire `output`, or undefined for "inherit" (the field is omitted). */
  output: TaskOutput | undefined;
  /** False only when "write to a file" is chosen with no filename yet — blocks submit. */
  outputReady: boolean;
}

/**
 * The terminal-output selector for a single dispatch: "" = inherit (a pipeline keeps
 * its own outputs, an agent delivers nothing), or an explicit PR / file / void. A
 * `file` with no name yet projects to nothing and blocks submit, so the choice is
 * never silently dropped.
 */
export function useTaskOutput(): UseTaskOutput {
  const [outputType, setOutputType] = useState<OutputType>("");
  const [fileDest, setFileDest] = useState<FileDest>("project");
  const [fileTo, setFileTo] = useState("");

  const output: TaskOutput | undefined = useMemo(() => {
    if (outputType === "pr") return { type: "pr" };
    if (outputType === "void") return { type: "void" };
    if (outputType === "file" && fileTo.trim())
      return { type: "file", dest: fileDest, to: fileTo.trim() };
    return undefined;
  }, [outputType, fileDest, fileTo]);

  const outputReady = outputType !== "file" || fileTo.trim().length > 0;

  return {
    outputType,
    setOutputType,
    fileDest,
    setFileDest,
    fileTo,
    setFileTo,
    output,
    outputReady,
  };
}
