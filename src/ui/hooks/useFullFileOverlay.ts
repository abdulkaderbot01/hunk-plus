/**
 * Full-file overlay for the review stream.
 *
 * When full-file mode is active, every diff file that has a `sourceFetcher`
 * is replaced with a synthesized full-file diff built from the per-side
 * source text. Files without a fetcher (e.g. raw patches where the loader
 * could not attach one) keep their original hunk-only diff.
 */

import { useEffect, useMemo, useState } from "react";
import { SourceTextTooLargeError } from "../../core/fileSource";
import type { DiffFile } from "../../core/types";
import {
  type FileSourceStatus,
  type GapExpansionMap,
  seamlessGapExpansionsForFile,
} from "../diff/expandCollapsedRows";
import { buildFullFileDiff } from "../lib/fullFilePatch";

export type FullFileStatus = "loading" | "ready" | "unavailable" | "too-large";

export interface FullFileEntry {
  status: FullFileStatus;
  /** Full-file diff. Undefined while loading or when the source is unavailable. */
  file: DiffFile | undefined;
  /**
   * Source text for the side gap expansion reads from (old for deleted files,
   * new otherwise). Ready entries use it to render every gap pre-expanded.
   */
  sourceText: string | null;
  /** Diagnostic message when `status` is `unavailable` or `too-large`. */
  message: string | null;
}

export interface FullFileOverlay {
  /** Whether full-file mode is currently active. */
  enabled: boolean;
  /** Per-file overlay keyed by file id. */
  byFileId: Record<string, FullFileEntry>;
  /** Toggle full-file mode on or off. */
  setEnabled: (next: boolean) => void;
}

const EMPTY_BY_FILE_ID: Record<string, FullFileEntry> = {};

/** Run one fetcher side and normalize the result into a (text|null) pair. */
async function fetchSide(
  fetcher: NonNullable<DiffFile["sourceFetcher"]>,
  side: "old" | "new",
): Promise<{ text: string | null; error: string | null; tooLarge: boolean }> {
  try {
    const text = await fetcher.getFullText(side);
    return { text, error: null, tooLarge: false };
  } catch (error) {
    if (error instanceof SourceTextTooLargeError) {
      return {
        text: null,
        error: `Source is too large to expand (>${error.maxBytes} bytes).`,
        tooLarge: true,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { text: null, error: message, tooLarge: false };
  }
}

/** Build the full-file diff for one source file, returning a stable entry shape. */
async function buildEntryForFile(file: DiffFile): Promise<FullFileEntry> {
  const fetcher = file.sourceFetcher;
  if (!fetcher) {
    return {
      status: "unavailable",
      file: undefined,
      sourceText: null,
      message: "Full file view unavailable: no source fetcher.",
    };
  }

  const [oldResult, newResult] = await Promise.all([
    fetchSide(fetcher, "old"),
    fetchSide(fetcher, "new"),
  ]);

  if (oldResult.tooLarge || newResult.tooLarge) {
    return {
      status: "too-large",
      file: undefined,
      sourceText: null,
      message: oldResult.error ?? newResult.error,
    };
  }

  if (oldResult.error || newResult.error) {
    return {
      status: "unavailable",
      file: undefined,
      sourceText: null,
      message: oldResult.error ?? newResult.error,
    };
  }

  const { patch, metadata } = buildFullFileDiff({
    cacheKey: file.id,
    newText: newResult.text,
    oldText: oldResult.text,
    path: file.path,
    previousPath: file.previousPath,
  });

  return {
    status: "ready",
    file: { ...file, metadata, patch },
    // Gap expansion reads the deleted side's text for deleted files and the
    // new side's text otherwise; mirror that policy here.
    sourceText: metadata.type === "deleted" ? oldResult.text : newResult.text,
    message: null,
  };
}

/**
 * Own the full-file overlay state. The returned `byFileId` is keyed by the
 * original file id, and callers should fall back to the original file when
 * the entry is missing, loading, or unavailable.
 */
export function useFullFileOverlay(files: DiffFile[]): FullFileOverlay {
  const [enabled, setEnabled] = useState(false);
  const [byFileId, setByFileId] = useState<Record<string, FullFileEntry>>(EMPTY_BY_FILE_ID);

  useEffect(() => {
    if (!enabled) {
      setByFileId(EMPTY_BY_FILE_ID);
      return;
    }

    let cancelled = false;

    setByFileId((current) => {
      const next: Record<string, FullFileEntry> = {};
      for (const file of files) {
        const existing = current[file.id];
        if (existing && existing.status === "ready") {
          // Cache hit — keep the previous entry; we'll revalidate when the fetcher
          // identity changes (the file list effect drops the cache by changing
          // file references on soft reload).
          next[file.id] = existing;
        } else {
          next[file.id] = {
            status: "loading",
            file: undefined,
            sourceText: null,
            message: null,
          };
        }
      }
      return next;
    });

    void Promise.all(
      files.map(async (file) => {
        const entry = await buildEntryForFile(file);
        if (cancelled) {
          return;
        }
        setByFileId((current) => {
          // Skip writes for files that have since disappeared from the review stream.
          if (!(file.id in current) && !files.some((candidate) => candidate.id === file.id)) {
            return current;
          }
          return { ...current, [file.id]: entry };
        });
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [enabled, files]);

  // Memoize the overlay object so downstream memos keyed on it (e.g. the
  // effective file list fed to the review controller) stay referentially
  // stable across unrelated renders. Without this, applyFullFileOverlay
  // produces a fresh files array every render while enabled, which retriggers
  // render-time file-snapshot reconciliation forever (infinite render loop).
  return useMemo(() => ({ enabled, byFileId, setEnabled }), [enabled, byFileId]);
}

/**
 * Apply the overlay to a list of files. Each file is replaced with its
 * full-file counterpart when ready, otherwise the original is preserved.
 */
export function applyFullFileOverlay(files: DiffFile[], overlay: FullFileOverlay): DiffFile[] {
  if (!overlay.enabled) {
    return files;
  }
  return files.map((file) => overlay.byFileId[file.id]?.file ?? file);
}

/**
 * Overlay seamless full expansions for every ready full-file entry so those
 * files render as one continuous listing. Files without a ready entry keep
 * their interactive per-gap expansion state.
 */
export function applyFullFileExpansions(
  overlay: FullFileOverlay,
  expandedGapsByFileId: Record<string, GapExpansionMap>,
): Record<string, GapExpansionMap> {
  if (!overlay.enabled) {
    return expandedGapsByFileId;
  }

  const next = { ...expandedGapsByFileId };
  for (const [fileId, entry] of Object.entries(overlay.byFileId)) {
    if (entry.status === "ready" && entry.file) {
      next[fileId] = seamlessGapExpansionsForFile(entry.file.metadata);
    }
  }
  return next;
}

/**
 * Overlay loaded source statuses for ready full-file entries so their
 * pre-expanded gaps can fill immediately from the already-fetched text.
 */
export function applyFullFileSourceStatus(
  overlay: FullFileOverlay,
  sourceStatusByFileId: Record<string, FileSourceStatus>,
): Record<string, FileSourceStatus> {
  if (!overlay.enabled) {
    return sourceStatusByFileId;
  }

  const next = { ...sourceStatusByFileId };
  for (const [fileId, entry] of Object.entries(overlay.byFileId)) {
    if (entry.status === "ready" && entry.sourceText !== null) {
      next[fileId] = { kind: "loaded", text: entry.sourceText };
    }
  }
  return next;
}
