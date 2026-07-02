/**
 * Unit tests for per-file git actions.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGitAction } from "./gitActions";

const originalSpawnSync = Bun.spawnSync;
const tempDirs: string[] = [];

function createTempDir() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "hunk-git-action-")));
  tempDirs.push(dir);
  return dir;
}

function mockSpawnSync(
  implementation: (cmds: string[], options?: Parameters<typeof Bun.spawnSync>[1]) => unknown,
) {
  const mutableBun = Bun as unknown as { spawnSync: typeof Bun.spawnSync };
  mutableBun.spawnSync = implementation as typeof Bun.spawnSync;
}

afterEach(() => {
  mockSpawnSync(originalSpawnSync);
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("runGitAction", () => {
  test("returns a soft error when no repo root is available", () => {
    const result = runGitAction({ filePath: "alpha.ts", kind: "stage", repoRoot: "" });
    expect(result.ran).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/no git repository/i);
  });

  test("returns a soft error when no file path is provided", () => {
    const result = runGitAction({ filePath: "", kind: "stage", repoRoot: "/repo" });
    expect(result.ran).toBe(false);
    expect(result.stderr).toMatch(/no file/i);
  });

  test("discard refuses to run when the file does not exist on disk", () => {
    const result = runGitAction({
      filePath: "missing.ts",
      kind: "discard",
      repoRoot: createTempDir(),
    });
    expect(result.ran).toBe(false);
    expect(result.stderr).toMatch(/does not exist/i);
  });

  test("stage runs git add with the file path", () => {
    const calls: string[][] = [];
    mockSpawnSync((cmds) => {
      calls.push(cmds);
      return { exitCode: 0, stderr: new Uint8Array() };
    });

    const result = runGitAction({
      filePath: "src/example.ts",
      kind: "stage",
      repoRoot: "/repo",
    });
    expect(result.ran).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.launchError).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["git", "add", "--", "src/example.ts"]);
  });

  test("unstage runs git reset HEAD with the file path", () => {
    const calls: string[][] = [];
    mockSpawnSync((cmds) => {
      calls.push(cmds);
      return { exitCode: 0, stderr: new Uint8Array() };
    });

    const result = runGitAction({
      filePath: "src/example.ts",
      kind: "unstage",
      repoRoot: "/repo",
    });
    expect(result.ran).toBe(true);
    expect(calls[0]).toEqual(["git", "reset", "HEAD", "--", "src/example.ts"]);
    expect(result).toBeDefined();
  });

  test("discard runs git checkout with the file path", () => {
    const repoRoot = createTempDir();
    mkdirSync(join(repoRoot, "src"), { recursive: true });
    writeFileSync(join(repoRoot, "src/example.ts"), "old contents");
    const calls: string[][] = [];
    mockSpawnSync((cmds) => {
      calls.push(cmds);
      return { exitCode: 0, stderr: new Uint8Array() };
    });

    const result = runGitAction({
      filePath: "src/example.ts",
      kind: "discard",
      repoRoot,
    });
    expect(result.ran).toBe(true);
    expect(calls[0]).toEqual(["git", "checkout", "--", "src/example.ts"]);
  });

  test("captures git stderr on failure", () => {
    mockSpawnSync(() => ({
      exitCode: 128,
      stderr: new TextEncoder().encode("error: pathspec 'missing.ts' did not match\n"),
    }));

    const result = runGitAction({
      filePath: "missing.ts",
      kind: "stage",
      repoRoot: "/repo",
    });
    expect(result.ran).toBe(true);
    expect(result.exitCode).toBe(128);
    expect(result.stderr).toMatch(/pathspec/);
  });

  test("captures launch failures", () => {
    mockSpawnSync(() => {
      throw new Error("git not installed");
    });

    const result = runGitAction({
      filePath: "alpha.ts",
      kind: "stage",
      repoRoot: "/repo",
    });
    expect(result.ran).toBe(false);
    expect(result.launchError).toBe("git not installed");
  });
});
