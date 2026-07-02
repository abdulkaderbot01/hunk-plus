/**
 * Unit tests for the lazygit launcher primitives.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { buildLazygitCommand, runLazygit } from "./lazygit";

const originalSpawnSync = Bun.spawnSync;

function mockSpawnSync(
  implementation: (cmds: string[], options?: Parameters<typeof Bun.spawnSync>[1]) => unknown,
) {
  const mutableBun = Bun as unknown as { spawnSync: typeof Bun.spawnSync };
  mutableBun.spawnSync = implementation as typeof Bun.spawnSync;
}

afterEach(() => {
  mockSpawnSync(originalSpawnSync);
});

describe("buildLazygitCommand", () => {
  test("uses `lazygit` as the default binary", () => {
    expect(buildLazygitCommand({ cwd: "/repo" })).toEqual({
      command: "lazygit",
      args: [],
      cwd: "/repo",
    });
  });

  test("forwards a custom binary and args", () => {
    expect(
      buildLazygitCommand({
        args: ["--path", "/custom"],
        binary: "lg",
        cwd: "/repo",
      }),
    ).toEqual({
      command: "lg",
      args: ["--path", "/custom"],
      cwd: "/repo",
    });
  });

  test("throws when cwd is empty", () => {
    expect(() => buildLazygitCommand({ cwd: "" })).toThrow(/cwd/);
  });
});

describe("runLazygit", () => {
  test("returns the exit code from a clean run", () => {
    const calls: Array<{ cmds: string[]; options: unknown }> = [];
    mockSpawnSync((cmds, options) => {
      calls.push({ cmds, options });
      return { exitCode: 0 };
    });

    const result = runLazygit({ cwd: "/repo" });
    expect(result.exitCode).toBe(0);
    expect(result.launchError).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cmds).toEqual(["lazygit"]);
  });

  test("captures non-zero exit codes", () => {
    mockSpawnSync(() => ({ exitCode: 137 }));

    const result = runLazygit({ cwd: "/repo" });
    expect(result.exitCode).toBe(137);
    expect(result.launchError).toBeNull();
  });

  test("captures spawn failures", () => {
    mockSpawnSync(() => {
      throw new Error("binary not found");
    });

    const result = runLazygit({ binary: "missing-lg", cwd: "/repo" });
    expect(result.exitCode).toBe(0);
    expect(result.launchError).toBe("binary not found");
  });
});
