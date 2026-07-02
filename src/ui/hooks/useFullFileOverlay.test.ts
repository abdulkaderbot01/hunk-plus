/**
 * Unit tests for the pure applyFullFileOverlay helper.
 *
 * The hook itself is exercised by the full UI tests; this file covers the
 * pure mapping helper that the hook feeds.
 */

import { describe, expect, test } from "bun:test";
import { createTestDiffFile, createTestSourceFetcher } from "../../../test/helpers/diff-helpers";
import { applyFullFileOverlay, type FullFileOverlay } from "./useFullFileOverlay";

function overlay(enabled: boolean, byFileId: FullFileOverlay["byFileId"] = {}): FullFileOverlay {
  return {
    byFileId,
    enabled,
    setEnabled: () => {},
  };
}

describe("applyFullFileOverlay", () => {
  test("returns the original files when the overlay is disabled", () => {
    const file = createTestDiffFile({ id: "a", path: "a.ts" });
    expect(applyFullFileOverlay([file], overlay(false))).toEqual([file]);
  });

  test("returns the original files when no overlay entry is present", () => {
    const file = createTestDiffFile({ id: "a", path: "a.ts" });
    expect(applyFullFileOverlay([file], overlay(true, {}))).toEqual([file]);
  });

  test("substitutes the ready overlay file when one is available", () => {
    const fetcher = createTestSourceFetcher(() => "alpha\n");
    const file = createTestDiffFile({ id: "a", path: "a.ts", sourceFetcher: fetcher });
    const overlayFile = { ...file, patch: "overlay" };
    const result = applyFullFileOverlay(
      [file],
      overlay(true, { a: { status: "ready", file: overlayFile, message: null } }),
    );
    expect(result).toEqual([overlayFile]);
  });

  test("falls back to the original file for non-ready overlay entries", () => {
    const file = createTestDiffFile({ id: "a", path: "a.ts" });
    const result = applyFullFileOverlay(
      [file],
      overlay(true, { a: { status: "loading", file: undefined, message: null } }),
    );
    expect(result).toEqual([file]);
  });
});
