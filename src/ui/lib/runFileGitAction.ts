/**
 * UI-level wrapper for per-file git actions (stage, unstage, discard).
 *
 * Keeps the renderer hookup local to the UI layer and centralizes the
 * "no file selected / no repo available" early returns so the App can stay
 * focused on routing actions to the right file.
 */

import type { DiffFile } from "../../core/types";
import { runGitAction, type GitActionKind, type GitActionResult } from "../../core/gitActions";

export interface RunFileGitActionOptions {
  kind: GitActionKind;
  file: DiffFile | undefined;
  repoRoot: string | undefined;
}

export interface FileGitActionFeedback {
  status: "ran" | "no-file" | "no-repo" | "no-action";
  result: GitActionResult | null;
}

/** Run one per-file git action and return a small UI-friendly feedback shape. */
export function runFileGitAction({
  kind,
  file,
  repoRoot,
}: RunFileGitActionOptions): FileGitActionFeedback {
  if (!file) {
    return {
      status: "no-file",
      result: {
        kind,
        exitCode: 1,
        ran: false,
        stderr: "No file is selected.",
        launchError: null,
      },
    };
  }
  if (!repoRoot) {
    return {
      status: "no-repo",
      result: {
        kind,
        exitCode: 1,
        ran: false,
        stderr: "No git repository root is available for this review.",
        launchError: null,
      },
    };
  }
  return { status: "ran", result: runGitAction({ filePath: file.path, kind, repoRoot }) };
}
