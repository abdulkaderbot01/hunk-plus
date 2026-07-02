/**
 * Full-file overlay for the review stream.
 *
 * When full-file mode is active, every diff file that has a `sourceFetcher`
 * is replaced with a synthesized full-file diff built from the per-side
 * source text. Files without a fetcher (e.g. raw patches where the loader
 * could not attach one) keep their original hunk-only diff.
 */

import { useEffect, useState } from "react";
import { SourceTextTooLargeError } from "../../core/fileSource";
import type { DiffFile } from "../../core/types";
import { buildFullFileDiff } from "../lib/fullFilePatch";

export type FullFileStatus = "loading" | "ready" | "unavailable" | "too-large";

export interface FullFileEntry {
  status: FullFileStatus;
  /** Full-file diff. Undefined while loading or when the source is unavailable. */
  file: DiffFile | undefined;
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
      message: oldResult.error ?? newResult.error,
    };
  }

  if (oldResult.error || newResult.error) {
    return {
      status: "unavailable",
      file: undefined,
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

  return { enabled, byFileId, setEnabled };
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
