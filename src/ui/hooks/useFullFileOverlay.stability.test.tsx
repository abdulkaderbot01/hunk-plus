/**
 * Regression coverage for the full-file overlay's render stability.
 *
 * The harness mirrors the `App` wiring: the overlay output feeds
 * `applyFullFileOverlay`, whose result feeds `useReviewController`. The
 * controller snapshots its `files` input during render, so the overlay must
 * be referentially stable across unrelated renders — a fresh overlay object
 * per render produces a fresh effective files array per render, which loops
 * the controller's snapshot reconciliation into an infinite render.
 */

import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act, useEffect, useMemo } from "react";
import type { DiffFile } from "../../core/types";
import { createTestDiffFile, createTestSourceFetcher } from "../../../test/helpers/diff-helpers";
import {
  applyFullFileOverlay,
  type FullFileOverlay,
  useFullFileOverlay,
} from "./useFullFileOverlay";
import { useReviewController } from "./useReviewController";

/** Snapshot of one committed harness render, captured for stability assertions. */
interface HarnessRender {
  overlay: FullFileOverlay;
  effectiveFiles: DiffFile[];
}

function FullFileHarness({
  files,
  onRender,
}: {
  files: DiffFile[];
  onRender: (render: HarnessRender) => void;
}) {
  const overlay = useFullFileOverlay(files);
  const effectiveFiles = useMemo(() => applyFullFileOverlay(files, overlay), [files, overlay]);
  useReviewController({ files: effectiveFiles });

  useEffect(() => {
    onRender({ overlay, effectiveFiles });
  });

  return null;
}

/** Let overlay fetches and follow-up effects settle before reading state. */
async function flush(setup: Awaited<ReturnType<typeof testRender>>) {
  await act(async () => {
    await setup.renderOnce();
    await Bun.sleep(0);
    await setup.renderOnce();
  });
}

describe("useFullFileOverlay render stability", () => {
  test("enabling full-file mode settles instead of re-rendering forever", async () => {
    const fetcher = createTestSourceFetcher((side) =>
      side === "old"
        ? "const alpha = 1;\nconst beta = 2;\n"
        : "const alpha = 10;\nconst beta = 2;\n",
    );
    const file = createTestDiffFile({
      after: "const alpha = 10;\nconst beta = 2;\n",
      before: "const alpha = 1;\nconst beta = 2;\n",
      id: "alpha",
      path: "alpha.ts",
      sourceFetcher: fetcher,
    });

    const renders: HarnessRender[] = [];
    const setup = await testRender(
      <FullFileHarness files={[file]} onRender={(render) => renders.push(render)} />,
      { width: 80, height: 4 },
    );

    try {
      await flush(setup);
      const initial = renders.at(-1);
      expect(initial).toBeDefined();

      // Pre-fix this act() never settles: each commit produced a fresh overlay
      // object, so the review controller's files snapshot re-armed every render.
      await act(async () => {
        initial!.overlay.setEnabled(true);
      });
      await flush(setup);
      await flush(setup);

      const settled = renders.at(-1)!;
      expect(settled.overlay.enabled).toBe(true);
      expect(settled.overlay.byFileId["alpha"]?.status).toBe("ready");

      // Bounded render count is the regression guard: the loop produced
      // hundreds of commits before React aborted with an update-depth error.
      expect(renders.length).toBeLessThan(20);

      // Extra flushes with no state changes must not mint new identities.
      await flush(setup);
      const after = renders.at(-1)!;
      expect(after.overlay).toBe(settled.overlay);
      expect(after.effectiveFiles).toBe(settled.effectiveFiles);
    } finally {
      await act(async () => {
        setup.renderer.destroy();
      });
    }
  });
});
