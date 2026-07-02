/**
 * UI-level wrapper around the lazygit launcher.
 *
 * The TUI must suspend around lazygit (it takes over the terminal). This
 * module is the single place that pulls the renderer hooks so both the menu
 * action and the keyboard shortcut route through the same code path.
 */

import type { CliRenderer } from "@opentui/core";
import { runLazygitWithRenderer, type LazygitLaunchResult } from "../../core/lazygit";

export interface OpenLazygitOptions {
  binary?: string;
  args?: string[];
  cwd: string;
  renderer: Pick<CliRenderer, "suspend" | "resume" | "isDestroyed">;
}

/** Suspend the TUI, run lazygit in `cwd`, then resume. */
export function openLazygit({
  binary,
  args,
  cwd,
  renderer,
}: OpenLazygitOptions): LazygitLaunchResult {
  return runLazygitWithRenderer({ args, binary, cwd }, renderer);
}
