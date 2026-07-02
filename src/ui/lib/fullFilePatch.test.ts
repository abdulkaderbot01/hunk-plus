/**
 * Unit tests for the full-file patch builder.
 */

import { describe, expect, test } from "bun:test";
import { buildFullFileDiff } from "./fullFilePatch";

describe("buildFullFileDiff", () => {
  test("builds a change-type diff when both sides have text", () => {
    const { patch, metadata } = buildFullFileDiff({
      newText: "alpha = 2;\nbeta = 2;\n",
      oldText: "alpha = 1;\nbeta = 2;\n",
      path: "src/example.ts",
    });
    expect(metadata.type).toBe("change");
    expect(metadata.hunks.length).toBeGreaterThan(0);
    expect(patch).toContain("diff --git a/src/example.ts b/src/example.ts");
    expect(patch).toContain("-alpha = 1;");
    expect(patch).toContain("+alpha = 2;");
  });

  test("uses /dev/null for a new file", () => {
    const { patch, metadata } = buildFullFileDiff({
      newText: "fresh\n",
      oldText: null,
      path: "src/new.ts",
    });
    expect(metadata.type).toBe("new");
    expect(patch).toContain("--- /dev/null");
    expect(patch).toContain("+++ b/src/new.ts");
    expect(patch).toContain("+fresh");
  });

  test("uses /dev/null for a deleted file", () => {
    const { patch, metadata } = buildFullFileDiff({
      newText: null,
      oldText: "gone\n",
      path: "src/gone.ts",
    });
    expect(metadata.type).toBe("deleted");
    expect(patch).toContain("--- a/src/gone.ts");
    expect(patch).toContain("+++ /dev/null");
    expect(patch).toContain("-gone");
  });

  test("honors a separate previous path in the patch header", () => {
    const { patch } = buildFullFileDiff({
      newText: "stay\n",
      oldText: "was\n",
      path: "src/new-name.ts",
      previousPath: "src/old-name.ts",
    });
    expect(patch).toContain("diff --git a/src/old-name.ts b/src/new-name.ts");
    expect(patch).toContain("--- a/src/old-name.ts");
    expect(patch).toContain("+++ b/src/new-name.ts");
  });

  test("preserves custom context lines on the metadata", () => {
    const { metadata } = buildFullFileDiff({
      context: 1,
      newText: "a\nb\nc\n",
      oldText: "a\nB\nc\n",
      path: "src/example.ts",
    });
    // A 1-line context window around the changed `b` row should still produce a hunk.
    expect(metadata.hunks.length).toBe(1);
  });
});
