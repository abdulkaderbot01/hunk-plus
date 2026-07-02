/**
 * Lazygit launcher primitives.
 *
 * Lazygit takes over the terminal, so the TUI must suspend around it. This
 * module keeps that suspend/resume dance and the spawn invocation in one
 * place so both the renderer-driven UI code and any tests can drive it.
 */

export interface LazygitInvocation {
  /** Lazygit binary to spawn. Defaults to `lazygit`. */
  binary?: string;
  /** Extra args to forward to lazygit (e.g. `--path`, `--work-tree`). */
  args?: string[];
  /** Directory to run lazygit in. Should be the repo root. */
  cwd: string;
  /** Optional env overrides; the parent env is inherited otherwise. */
  env?: Record<string, string>;
}

export interface LazygitLaunchResult {
  /** Process exit code (0 when the user exited cleanly). */
  exitCode: number;
  /** Spawn error message when the binary could not be launched. */
  launchError: string | null;
}

/** Build the command argv for one lazygit invocation. */
export function buildLazygitCommand({ binary = "lazygit", args = [], cwd }: LazygitInvocation): {
  command: string;
  args: string[];
  cwd: string;
} {
  if (!cwd) {
    throw new Error("Lazygit launch requires a cwd (typically the repo root).");
  }
  return { command: binary, args, cwd };
}

/**
 * Launch lazygit. Returns a structured result; the caller is responsible for
 * wrapping this with renderer.suspend / renderer.resume so the TUI doesn't
 * fight lazygit for input.
 */
export function runLazygit(invocation: LazygitInvocation): LazygitLaunchResult {
  const { command, args, cwd } = buildLazygitCommand(invocation);

  let exitCode = 0;
  let launchError: string | null = null;
  try {
    const result = Bun.spawnSync([command, ...args], {
      cwd,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      env: invocation.env ? { ...process.env, ...invocation.env } : process.env,
    });
    exitCode = result.exitCode;
  } catch (error) {
    launchError = error instanceof Error ? error.message : String(error);
  }

  return { exitCode, launchError };
}

/** Convenience wrapper that suspends a TUI renderer, runs lazygit, then resumes. */
export function runLazygitWithRenderer(
  invocation: LazygitInvocation,
  renderer: Pick<
    { isDestroyed: boolean; suspend: () => void; resume: () => void },
    "isDestroyed" | "suspend" | "resume"
  >,
): LazygitLaunchResult {
  renderer.suspend();
  let result: LazygitLaunchResult;
  try {
    result = runLazygit(invocation);
  } finally {
    if (!renderer.isDestroyed) {
      renderer.resume();
    }
  }
  return result;
}
