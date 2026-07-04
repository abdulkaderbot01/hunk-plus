/**
 * Per-file git action primitives.
 *
 * Each action is intentionally narrow: it takes a repo root and a relative
 * file path, runs the equivalent `git` invocation, and returns a structured
 * result. Callers (the TUI) decide how to surface the result and whether to
 * refresh the diff after.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveGitRepoRoot } from "./git";
import type { VcsDiffCommandInput } from "./types";

export type GitActionKind = "stage" | "unstage" | "discard";

export interface GitActionOptions {
  repoRoot: string;
  filePath: string;
  /** Override the git binary. Defaults to `git`. */
  gitExecutable?: string;
}

export interface GitActionResult {
  kind: GitActionKind;
  exitCode: number;
  /** True when the action ran (file is tracked or appropriate for the action). */
  ran: boolean;
  /** First non-empty stderr line; useful for the status bar. */
  stderr: string | null;
  /** Spawn error message when the binary could not be launched. */
  launchError: string | null;
}

function buildArgs(kind: GitActionKind, filePath: string): string[] {
  switch (kind) {
    case "stage":
      // `--` prevents ambiguity when a path can be parsed as a ref or option.
      return ["add", "--", filePath];
    case "unstage":
      return ["reset", "HEAD", "--", filePath];
    case "discard":
      // `--` keeps the path from being misread; checkout restores both index and worktree.
      return ["checkout", "--", filePath];
  }
}

/** Run one per-file git action. Returns a structured result; never throws. */
export function runGitAction({
  repoRoot,
  filePath,
  gitExecutable = "git",
  kind,
}: GitActionOptions & { kind: GitActionKind }): GitActionResult {
  if (!repoRoot) {
    return {
      kind,
      exitCode: 1,
      ran: false,
      stderr: "No git repository root is available for this review.",
      launchError: null,
    };
  }

  if (!filePath) {
    return {
      kind,
      exitCode: 1,
      ran: false,
      stderr: "No file is selected.",
      launchError: null,
    };
  }

  // For discard we want a real file on disk; for stage/unstage git tolerates a missing path.
  if (kind === "discard" && !existsSync(resolve(repoRoot, filePath))) {
    return {
      kind,
      exitCode: 1,
      ran: false,
      stderr: `Cannot discard ${filePath}: file does not exist on disk.`,
      launchError: null,
    };
  }

  const args = buildArgs(kind, filePath);
  let exitCode = 0;
  let stderrText = "";
  let launchError: string | null = null;

  try {
    const result = Bun.spawnSync([gitExecutable, ...args], {
      cwd: repoRoot,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    exitCode = result.exitCode;
    stderrText = result.stderr ? new TextDecoder().decode(result.stderr) : "";
  } catch (error) {
    launchError = error instanceof Error ? error.message : String(error);
  }

  const stderr =
    stderrText
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? null;

  return {
    kind,
    exitCode,
    ran: launchError === null,
    stderr,
    launchError,
  };
}

/** Resolve a repo root through git, returning null if not inside a repo. */
export async function resolveOptionalRepoRoot(
  startPath: string,
  gitExecutable = "git",
): Promise<string | null> {
  // `resolveGitRepoRoot` throws on missing repos; convert that to a soft null so
  // callers can decide whether to surface the absence.
  const probe: VcsDiffCommandInput = { kind: "vcs", staged: false, options: {} };
  try {
    return await resolveGitRepoRoot(probe, { cwd: startPath, gitExecutable });
  } catch {
    return null;
  }
}
