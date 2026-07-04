import { sanitizeTerminalLine, sanitizeTerminalSpans } from "../../lib/terminalText";
import { expandDiffTabs } from "./codeColumns";
import type {
  CollapsedGapPosition,
  DiffRow,
  RenderSpan,
  SplitLineCell,
  StackLineCell,
} from "./pierre";
import { collapsedRowText, trailingCollapsedLines } from "./pierre";
import type { DiffFile } from "../../core/types";

export type ExpansionLayout = "split" | "stack";

/** Per-file load status for the source text used to fill expanded gaps. */
export type FileSourceStatus =
  | { kind: "loading" }
  | { kind: "loaded"; text: string }
  | { kind: "error"; reason?: "too-large" };

/**
 * How much of one collapsed gap is revealed, measured in lines from each edge.
 * `fromStart` reveals lines directly below the hunk above the gap; `fromEnd`
 * reveals lines directly above the hunk below it. When the two regions meet,
 * the gap renders fully expanded.
 */
export interface GapExpansion {
  fromStart: number;
  fromEnd: number;
  /**
   * Seamless gaps render their revealed lines without the interactive status
   * row, so the file reads as one continuous listing (full-file view).
   */
  seamless?: boolean;
}

export type GapExpansionMap = ReadonlyMap<string, GapExpansion>;

/** Lines revealed per directional expand step, mirroring IDE diff viewers. */
export const GAP_EXPANSION_STEP = 20;

/** Line count that always covers a whole gap regardless of its size. */
export const GAP_EXPANSION_ALL = Number.MAX_SAFE_INTEGER;

export const EMPTY_GAP_EXPANSIONS: GapExpansionMap = new Map();

/** One collapsed-gap affordance action requested from the UI. */
export type GapRequest =
  | { kind: "expand"; direction: "down" | "up" | "all" }
  | { kind: "collapse" };

/**
 * Apply one gap request to the current expansion of a gap. Returns the next
 * expansion, or `null` when the gap should return to its collapsed state.
 */
export function applyGapRequest(
  current: GapExpansion | undefined,
  request: GapRequest,
): GapExpansion | null {
  if (request.kind === "collapse") {
    return null;
  }

  const base = current ?? { fromStart: 0, fromEnd: 0 };
  switch (request.direction) {
    case "down":
      return {
        ...base,
        fromStart: Math.min(GAP_EXPANSION_ALL, base.fromStart + GAP_EXPANSION_STEP),
      };
    case "up":
      return { ...base, fromEnd: Math.min(GAP_EXPANSION_ALL, base.fromEnd + GAP_EXPANSION_STEP) };
    case "all":
      return { fromStart: GAP_EXPANSION_ALL, fromEnd: 0 };
  }
}

/**
 * Build a seamless full expansion for every gap in one file. Used by the
 * full-file view to render the whole file as one continuous listing without
 * interactive gap rows.
 */
export function seamlessGapExpansionsForFile(metadata: DiffFile["metadata"]): GapExpansionMap {
  const expansions = new Map<string, GapExpansion>();
  for (const [hunkIndex, hunk] of metadata.hunks.entries()) {
    if (hunk.collapsedBefore > 0) {
      expansions.set(gapKey("before", hunkIndex), {
        fromStart: GAP_EXPANSION_ALL,
        fromEnd: 0,
        seamless: true,
      });
    }
  }

  if (trailingCollapsedLines(metadata) > 0) {
    expansions.set(gapKey("trailing", metadata.hunks.length - 1), {
      fromStart: GAP_EXPANSION_ALL,
      fromEnd: 0,
      seamless: true,
    });
  }

  return expansions;
}

export interface ExpandCollapsedRowsOptions {
  layout: ExpansionLayout;
  expandedGaps: GapExpansionMap;
  sourceStatus: FileSourceStatus | undefined;
  /** Optional syntax-aware span resolver for a zero-based source line. */
  sourceLineSpans?: (line: string | undefined, sourceLineNumber: number) => RenderSpan[];
  // Whose side's line indices in the source text. Defaults to "new".
  // For deleted files (no new side) callers should pass "old" instead.
  side?: "old" | "new";
}

/** Stable identifier for one collapsed gap inside a single file. */
export function gapKey(position: CollapsedGapPosition, hunkIndex: number) {
  return `${position}:${hunkIndex}`;
}

/**
 * Pick the gap key that the keyboard shortcut should toggle for the selected
 * hunk. Looks at the leading gap of the current hunk first, then the leading
 * gaps of subsequent hunks, and finally the trailing gap of the file. Returns
 * `null` when no reachable gap exists.
 */
export function selectGapForKeyboardToggle(
  hunks: ReadonlyArray<{ collapsedBefore: number }>,
  selectedHunkIndex: number,
  hasTrailingGap: boolean,
): string | null {
  if (hunks.length === 0) {
    return null;
  }

  const startIndex = Math.max(0, Math.min(selectedHunkIndex, hunks.length - 1));
  for (let index = startIndex; index < hunks.length; index += 1) {
    if ((hunks[index]?.collapsedBefore ?? 0) > 0) {
      return gapKey("before", index);
    }
  }

  if (hasTrailingGap) {
    return gapKey("trailing", hunks.length - 1);
  }

  return null;
}

function expandedRowText(lineCount: number) {
  return `Hide ${lineCount} unchanged ${lineCount === 1 ? "line" : "lines"}`;
}

function loadingRowText(lineCount: number) {
  return `Loading ${lineCount} unchanged ${lineCount === 1 ? "line" : "lines"}…`;
}

function errorRowText(lineCount: number, reason?: "too-large") {
  if (reason === "too-large") {
    return `Source too large to expand ${lineCount} unchanged ${lineCount === 1 ? "line" : "lines"}`;
  }

  return `Could not load ${lineCount} unchanged ${lineCount === 1 ? "line" : "lines"}`;
}

function sliceLines(sourceText: string) {
  // Normalize CRLF so Windows-authored sources don't leak `\r` into rendered spans.
  const normalized = sourceText.replaceAll("\r\n", "\n");
  const trimmed = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return trimmed.length === 0 ? [] : trimmed.split("\n");
}

function spansFor(line: string | undefined): RenderSpan[] {
  const text = expandDiffTabs(sanitizeTerminalLine(line ?? ""));
  return text.length > 0 ? [{ text }] : [];
}

function buildSplitContextRow(
  fileId: string,
  hunkIndex: number,
  position: CollapsedGapPosition,
  index: number,
  oldLineNumber: number,
  newLineNumber: number,
  spans: RenderSpan[],
): Extract<DiffRow, { type: "split-line" }> {
  const cell = (lineNumber: number): SplitLineCell => ({
    kind: "context",
    sign: " ",
    lineNumber,
    spans,
  });

  return {
    type: "split-line",
    key: `${fileId}:expanded:${position}:${hunkIndex}:${index}`,
    fileId,
    hunkIndex,
    left: cell(oldLineNumber),
    right: cell(newLineNumber),
    isExpansionRow: true,
  };
}

function buildStackContextRow(
  fileId: string,
  hunkIndex: number,
  position: CollapsedGapPosition,
  index: number,
  oldLineNumber: number,
  newLineNumber: number,
  spans: RenderSpan[],
): Extract<DiffRow, { type: "stack-line" }> {
  const cell: StackLineCell = {
    kind: "context",
    sign: " ",
    oldLineNumber,
    newLineNumber,
    spans,
  };

  return {
    type: "stack-line",
    key: `${fileId}:expanded:${position}:${hunkIndex}:${index}`,
    fileId,
    hunkIndex,
    cell,
    isExpansionRow: true,
  };
}

/**
 * Replace each expanded collapsed row with the actual unchanged file lines it
 * represents. Partial expansions reveal lines from either edge of the gap and
 * keep a collapsed status row for the remainder; full expansions replace the
 * whole gap (keeping a "Hide" status row unless the expansion is seamless).
 * When source is still loading or failed, only the row label changes so the
 * user sees the state of the request.
 */
export function expandCollapsedRows(
  rows: DiffRow[],
  options: ExpandCollapsedRowsOptions,
): DiffRow[] {
  const { layout, expandedGaps, sourceLineSpans, sourceStatus, side = "new" } = options;

  if (expandedGaps.size === 0) {
    return rows;
  }

  const sourceLines = sourceStatus?.kind === "loaded" ? sliceLines(sourceStatus.text) : [];
  const result: DiffRow[] = [];

  for (const row of rows) {
    if (row.type !== "collapsed") {
      result.push(row);
      continue;
    }

    const key = gapKey(row.position, row.hunkIndex);
    const expansion = expandedGaps.get(key);
    if (!expansion) {
      result.push(row);
      continue;
    }

    const range = side === "old" ? row.oldRange : row.newRange;
    const lineCount = Math.max(0, range[1] - range[0] + 1);

    if (sourceStatus?.kind === "loading") {
      result.push({ ...row, text: loadingRowText(lineCount), gapState: "loading" });
      continue;
    }

    if (sourceStatus?.kind === "error") {
      result.push({
        ...row,
        text: errorRowText(lineCount, sourceStatus.reason),
        gapState: "error",
      });
      continue;
    }

    if (sourceStatus === undefined) {
      // expandedGaps can briefly contain a key before the controller's load
      // status is committed; keep the original label until status arrives.
      result.push(row);
      continue;
    }

    const sourceStartIndex = range[0] - 1;
    const sourceEndIndex = range[1] - 1;
    if (
      lineCount > 0 &&
      (sourceStartIndex < 0 ||
        sourceEndIndex < sourceStartIndex ||
        sourceEndIndex >= sourceLines.length)
    ) {
      result.push({ ...row, text: errorRowText(lineCount), gapState: "error" });
      continue;
    }

    const pushContextRow = (offset: number) => {
      const oldLineNumber = row.oldRange[0] + offset;
      const newLineNumber = row.newRange[0] + offset;
      const sourceLineNumber = (side === "old" ? oldLineNumber : newLineNumber) - 1;
      if (sourceLineNumber < 0 || sourceLineNumber >= sourceLines.length) {
        return false;
      }

      const text = sourceLines[sourceLineNumber];
      const spans = sourceLineSpans
        ? sanitizeTerminalSpans(sourceLineSpans(text, sourceLineNumber))
        : spansFor(text);

      result.push(
        layout === "split"
          ? buildSplitContextRow(
              row.fileId,
              row.hunkIndex,
              row.position,
              offset,
              oldLineNumber,
              newLineNumber,
              spans,
            )
          : buildStackContextRow(
              row.fileId,
              row.hunkIndex,
              row.position,
              offset,
              oldLineNumber,
              newLineNumber,
              spans,
            ),
      );
      return true;
    };

    // Clamp the requested edges into the gap so overlapping or oversized
    // expansions degrade into "fully expanded" instead of duplicating lines.
    const fromStart = Math.min(Math.max(0, expansion.fromStart), lineCount);
    const fromEnd = Math.min(Math.max(0, expansion.fromEnd), lineCount - fromStart);
    const remaining = lineCount - fromStart - fromEnd;

    if (remaining <= 0) {
      if (!expansion.seamless) {
        result.push({
          ...row,
          text: expandedRowText(lineCount),
          hiddenLines: 0,
          gapState: "expanded",
        });
      }
      for (let offset = 0; offset < lineCount; offset += 1) {
        if (!pushContextRow(offset)) {
          break;
        }
      }
      continue;
    }

    for (let offset = 0; offset < fromStart; offset += 1) {
      if (!pushContextRow(offset)) {
        break;
      }
    }

    result.push({
      ...row,
      text: collapsedRowText(remaining),
      oldRange: [row.oldRange[0] + fromStart, row.oldRange[1] - fromEnd],
      newRange: [row.newRange[0] + fromStart, row.newRange[1] - fromEnd],
      hiddenLines: remaining,
      gapState: "collapsed",
    });

    for (let offset = lineCount - fromEnd; offset < lineCount; offset += 1) {
      if (!pushContextRow(offset)) {
        break;
      }
    }
  }

  return result;
}
