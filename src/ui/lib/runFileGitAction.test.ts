/**
 * Unit tests for the UI-level runFileGitAction helper.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { createTestDiffFile } from "../../../test/helpers/diff-helpers";
import { runFileGitAction } from "./runFileGitAction";

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

describe("runFileGitAction", () => {
  test("returns a no-file result when no file is selected", () => {
    const result = runFileGitAction({ file: undefined, kind: "stage", repoRoot: "/repo" });
    expect(result.status).toBe("no-file");
    expect(result.result?.kind).toBe("stage");
    expect(result.result?.ran).toBe(false);
  });

  test("returns a no-repo result when the repo root is missing", () => {
    const file = createTestDiffFile({ path: "src/example.ts" });
    const result = runFileGitAction({ file, kind: "discard", repoRoot: undefined });
    expect(result.status).toBe("no-repo");
    expect(result.result?.kind).toBe("discard");
    expect(result.result?.ran).toBe(false);
  });

  test("forwards to runGitAction when both file and repo root are present", () => {
    const calls: string[][] = [];
    mockSpawnSync((cmds) => {
      calls.push(cmds);
      return { exitCode: 0, stderr: new Uint8Array() };
    });

    const file = createTestDiffFile({ path: "src/example.ts" });
    const result = runFileGitAction({ file, kind: "stage", repoRoot: "/repo" });
    expect(result.status).toBe("ran");
    expect(result.result?.ran).toBe(true);
    expect(calls[0]).toEqual(["git", "add", "--", "src/example.ts"]);
  });
});
