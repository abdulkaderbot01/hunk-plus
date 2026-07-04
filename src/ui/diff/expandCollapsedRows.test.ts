import { describe, expect, test } from "bun:test";
import {
  applyGapRequest,
  expandCollapsedRows,
  GAP_EXPANSION_ALL,
  GAP_EXPANSION_STEP,
  gapKey,
  seamlessGapExpansionsForFile,
  selectGapForKeyboardToggle,
  type GapExpansion,
} from "./expandCollapsedRows";
import type { DiffRow } from "./pierre";

function makeCollapsedRow(
  position: "before" | "trailing",
  hunkIndex: number,
  oldRange: [number, number],
  newRange: [number, number],
): Extract<DiffRow, { type: "collapsed" }> {
  return {
    type: "collapsed",
    key: `f:collapsed:${position}:${hunkIndex}`,
    fileId: "f",
    hunkIndex,
    text: `${oldRange[1] - oldRange[0] + 1} unchanged lines`,
    position,
    oldRange,
    newRange,
    hiddenLines: oldRange[1] - oldRange[0] + 1,
    gapState: "collapsed",
  };
}

/** Fully expanded entry for one gap, mirroring the "expand all" request. */
function fullExpansion(key: string, seamless = false): [string, GapExpansion] {
  return [
    key,
    { fromStart: GAP_EXPANSION_ALL, fromEnd: 0, ...(seamless ? { seamless: true } : {}) },
  ];
}

function makeHunkHeader(hunkIndex: number): Extract<DiffRow, { type: "hunk-header" }> {
  return {
    type: "hunk-header",
    key: `f:header:${hunkIndex}`,
    fileId: "f",
    hunkIndex,
    text: `@@ hunk ${hunkIndex} @@`,
  };
}

const SOURCE = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"].join("\n") + "\n";
const OSC52_CLIPBOARD = "\x1b]52;c;SGVsbG8=\x07";
const CSI_CLEAR_SCREEN = "\x1b[2J";
const DCS_PAYLOAD = "\x1bPqpayload\x1b\\";

function expectNoUnsafeTerminalControls(text: string) {
  expect(text).not.toContain(OSC52_CLIPBOARD);
  expect(text).not.toContain(CSI_CLEAR_SCREEN);
  expect(text).not.toContain(DCS_PAYLOAD);
  expect(text).not.toContain("\x07");
  expect(text).not.toContain("\r");
  expect(text).not.toContain("\b");
  expect(text).not.toContain("\x1b");
}

describe("expandCollapsedRows", () => {
  test("returns rows unchanged when no gaps are expanded", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 2], [1, 2]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expandedGaps: new Map(),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    expect(result).toBe(rows);
  });

  test("leaves the row unchanged when expansion is requested before status arrives", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 2], [1, 2]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expandedGaps: new Map([fullExpansion(gapKey("before", 0))]),
      sourceStatus: undefined,
      side: "new",
    });

    expect(result.map((row) => row.type)).toEqual(["collapsed", "hunk-header"]);
    const collapsed = result[0];
    if (!collapsed || collapsed.type !== "collapsed") {
      throw new Error("expected first row to be collapsed");
    }
    expect(collapsed.text.toLowerCase()).not.toContain("hide");
    expect(collapsed.text.toLowerCase()).not.toContain("loading");
  });

  test("rewrites the label to 'Loading…' while source is being fetched", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 3], [1, 3]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expandedGaps: new Map([fullExpansion(gapKey("before", 0))]),
      sourceStatus: { kind: "loading" },
      side: "new",
    });

    expect(result.map((row) => row.type)).toEqual(["collapsed", "hunk-header"]);
    const collapsed = result[0];
    if (!collapsed || collapsed.type !== "collapsed") {
      throw new Error("expected first row to be collapsed");
    }
    expect(collapsed.text.toLowerCase()).toContain("loading");
  });

  test("rewrites the label when source could not be loaded", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 3], [1, 3]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expandedGaps: new Map([fullExpansion(gapKey("before", 0))]),
      sourceStatus: { kind: "error" },
      side: "new",
    });

    expect(result.map((row) => row.type)).toEqual(["collapsed", "hunk-header"]);
    const collapsed = result[0];
    if (!collapsed || collapsed.type !== "collapsed") {
      throw new Error("expected first row to be collapsed");
    }
    expect(collapsed.text.toLowerCase()).toContain("could not load");
  });

  test("rewrites the label when source is too large to expand", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 3], [1, 3]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expandedGaps: new Map([fullExpansion(gapKey("before", 0))]),
      sourceStatus: { kind: "error", reason: "too-large" },
      side: "new",
    });

    const collapsed = result[0];
    if (!collapsed || collapsed.type !== "collapsed") {
      throw new Error("expected first row to be collapsed");
    }
    expect(collapsed.text.toLowerCase()).toContain("source too large");
  });

  test("inserts split-line context rows after the expanded collapsed row", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 3], [1, 3]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expandedGaps: new Map([fullExpansion(gapKey("before", 0))]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    expect(result.length).toBe(rows.length + 3);
    expect(result[0]?.type).toBe("collapsed");

    const inserted = result.slice(1, 4);
    expect(inserted.every((row) => row.type === "split-line")).toBe(true);

    const first = inserted[0];
    if (!first || first.type !== "split-line") {
      throw new Error("expected split-line context rows");
    }

    expect(first.left.kind).toBe("context");
    expect(first.right.kind).toBe("context");
    expect(first.left.lineNumber).toBe(1);
    expect(first.right.lineNumber).toBe(1);
    expect(first.left.spans[0]?.text).toBe("alpha");
    expect(first.right.spans[0]?.text).toBe("alpha");

    const third = inserted[2];
    if (!third || third.type !== "split-line") {
      throw new Error("expected three context rows");
    }
    expect(third.left.lineNumber).toBe(3);
    expect(third.right.spans[0]?.text).toBe("gamma");
  });

  test("inserts stack-line context rows when layout is stack", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [2, 3], [2, 3]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expandedGaps: new Map([fullExpansion(gapKey("before", 0))]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    const inserted = result.slice(1, 3);
    expect(inserted.every((row) => row.type === "stack-line")).toBe(true);

    const first = inserted[0];
    if (!first || first.type !== "stack-line") {
      throw new Error("expected stack-line context rows");
    }
    expect(first.cell.kind).toBe("context");
    expect(first.cell.oldLineNumber).toBe(2);
    expect(first.cell.newLineNumber).toBe(2);
    expect(first.cell.spans[0]?.text).toBe("beta");
  });

  test("changes the collapsed-row label to indicate expansion", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 2], [1, 2]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expandedGaps: new Map([fullExpansion(gapKey("before", 0))]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    const collapsed = result[0];
    if (!collapsed || collapsed.type !== "collapsed") {
      throw new Error("expected first row to be the collapsed marker");
    }
    expect(collapsed.text.toLowerCase()).toContain("hide");
  });

  test("expands trailing gaps from the requested side", () => {
    const rows: DiffRow[] = [makeHunkHeader(0), makeCollapsedRow("trailing", 0, [4, 6], [4, 6])];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expandedGaps: new Map([fullExpansion(gapKey("trailing", 0))]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    expect(result.length).toBe(rows.length + 3);
    const last = result[result.length - 1];
    if (!last || last.type !== "stack-line") {
      throw new Error("expected synthesized stack-line rows after the trailing collapsed row");
    }
    expect(last.cell.spans[0]?.text).toBe("zeta");
    expect(last.cell.newLineNumber).toBe(6);
  });

  test("uses the old-side range when side is `old`", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [2, 3], [10, 11]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expandedGaps: new Map([fullExpansion(gapKey("before", 0))]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "old",
    });

    const inserted = result.slice(1, 3);
    const first = inserted[0];
    if (!first || first.type !== "split-line") {
      throw new Error("expected split-line context rows");
    }
    expect(first.left.lineNumber).toBe(2);
    expect(first.right.lineNumber).toBe(10);
    expect(first.left.spans[0]?.text).toBe("beta");
    expect(first.right.spans[0]?.text).toBe("beta");
  });

  test("normalizes CRLF so expanded rows do not carry a stray carriage return", () => {
    const sourceWithCrlf = "alpha\r\nbeta\r\ngamma\r\n";
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 2], [1, 2]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expandedGaps: new Map([fullExpansion(gapKey("before", 0))]),
      sourceStatus: { kind: "loaded", text: sourceWithCrlf },
      side: "new",
    });

    const inserted = result[1];
    if (!inserted || inserted.type !== "stack-line") {
      throw new Error("expected stack-line context row");
    }
    expect(inserted.cell.spans[0]?.text).toBe("alpha");
  });

  test("does not pass terminal controls through expanded source rows", () => {
    const sourceWithControls = `safe${OSC52_CLIPBOARD}${CSI_CLEAR_SCREEN}${DCS_PAYLOAD}\x07\rspoof\bhidden\x1b\nfollow\n`;
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 1], [1, 1]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expandedGaps: new Map([fullExpansion(gapKey("before", 0))]),
      sourceStatus: { kind: "loaded", text: sourceWithControls },
      side: "new",
    });

    const inserted = result[1];
    if (!inserted || inserted.type !== "stack-line") {
      throw new Error("expected one stack-line row");
    }

    const text = inserted.cell.spans.map((span) => span.text).join("");
    expect(text).toContain("safe");
    expect(text).toContain("spoof");
    expect(text).toContain("hidden");
    expectNoUnsafeTerminalControls(text);
  });

  test("expands tabs in source lines so terminal cells stay aligned", () => {
    const sourceWithTab = "a\tb\nfollow\n";
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 1], [1, 1]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expandedGaps: new Map([fullExpansion(gapKey("before", 0))]),
      sourceStatus: { kind: "loaded", text: sourceWithTab },
      side: "new",
    });

    const inserted = result[1];
    if (!inserted || inserted.type !== "stack-line") {
      throw new Error("expected one stack-line row");
    }
    expect(inserted.cell.spans[0]?.text.includes("\t")).toBe(false);
  });

  test("uses caller-provided spans for expanded source lines", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [2, 3], [2, 3]), makeHunkHeader(0)];
    const calls: Array<{ line: string | undefined; sourceLineNumber: number }> = [];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expandedGaps: new Map([fullExpansion(gapKey("before", 0))]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      sourceLineSpans: (line, sourceLineNumber) => {
        calls.push({ line, sourceLineNumber });
        return [{ text: `highlighted:${line ?? ""}`, fg: "#abcdef" }];
      },
      side: "new",
    });

    expect(calls).toEqual([
      { line: "beta", sourceLineNumber: 1 },
      { line: "gamma", sourceLineNumber: 2 },
    ]);

    const inserted = result[1];
    if (!inserted || inserted.type !== "stack-line") {
      throw new Error("expected stack-line context row");
    }
    expect(inserted.cell.spans).toEqual([{ text: "highlighted:beta", fg: "#abcdef" }]);
  });

  test("shows an error row when loaded source is shorter than the collapsed range", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 3], [1, 3]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expandedGaps: new Map([fullExpansion(gapKey("before", 0))]),
      sourceStatus: { kind: "loaded", text: "alpha\n" },
      side: "new",
    });

    expect(result.map((row) => row.type)).toEqual(["collapsed", "hunk-header"]);
    const collapsed = result[0];
    if (!collapsed || collapsed.type !== "collapsed") {
      throw new Error("expected first row to be collapsed");
    }
    expect(collapsed.text.toLowerCase()).toContain("could not load");
    expect(collapsed.text.toLowerCase()).not.toContain("hide");
  });

  test("shows an error row when old-side split expansion is out of bounds", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [2, 3], [10, 11]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expandedGaps: new Map([fullExpansion(gapKey("before", 0))]),
      sourceStatus: { kind: "loaded", text: "alpha\n" },
      side: "old",
    });

    expect(result.map((row) => row.type)).toEqual(["collapsed", "hunk-header"]);
    const collapsed = result[0];
    if (!collapsed || collapsed.type !== "collapsed") {
      throw new Error("expected first row to be collapsed");
    }
    expect(collapsed.text.toLowerCase()).toContain("could not load");
  });
});

describe("expandCollapsedRows partial expansion", () => {
  test("reveals lines from the top edge and keeps a collapsed row for the rest", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 5], [1, 5]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expandedGaps: new Map([[gapKey("before", 0), { fromStart: 2, fromEnd: 0 }]]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    expect(result.map((row) => row.type)).toEqual([
      "stack-line",
      "stack-line",
      "collapsed",
      "hunk-header",
    ]);

    const [first, second] = result;
    if (first?.type !== "stack-line" || second?.type !== "stack-line") {
      throw new Error("expected two revealed context rows before the collapsed row");
    }
    expect(first.cell.spans[0]?.text).toBe("alpha");
    expect(second.cell.spans[0]?.text).toBe("beta");

    const collapsed = result[2];
    if (collapsed?.type !== "collapsed") {
      throw new Error("expected a collapsed remainder row");
    }
    expect(collapsed.text).toContain("3 unchanged lines");
    expect(collapsed.hiddenLines).toBe(3);
    expect(collapsed.gapState).toBe("collapsed");
    expect(collapsed.oldRange).toEqual([3, 5]);
    expect(collapsed.newRange).toEqual([3, 5]);
  });

  test("reveals lines from the bottom edge above the following hunk", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 5], [1, 5]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expandedGaps: new Map([[gapKey("before", 0), { fromStart: 0, fromEnd: 2 }]]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    expect(result.map((row) => row.type)).toEqual([
      "collapsed",
      "stack-line",
      "stack-line",
      "hunk-header",
    ]);

    const collapsed = result[0];
    if (collapsed?.type !== "collapsed") {
      throw new Error("expected the collapsed remainder row first");
    }
    expect(collapsed.hiddenLines).toBe(3);

    const [, first, second] = result;
    if (first?.type !== "stack-line" || second?.type !== "stack-line") {
      throw new Error("expected two revealed context rows after the collapsed row");
    }
    expect(first.cell.spans[0]?.text).toBe("delta");
    expect(first.cell.newLineNumber).toBe(4);
    expect(second.cell.spans[0]?.text).toBe("epsilon");
  });

  test("treats overlapping edge expansions as fully expanded without duplicating lines", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 3], [1, 3]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expandedGaps: new Map([[gapKey("before", 0), { fromStart: 2, fromEnd: 2 }]]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    expect(result.map((row) => row.type)).toEqual([
      "collapsed",
      "stack-line",
      "stack-line",
      "stack-line",
      "hunk-header",
    ]);
    const collapsed = result[0];
    if (collapsed?.type !== "collapsed") {
      throw new Error("expected the expanded status row first");
    }
    expect(collapsed.gapState).toBe("expanded");
    expect(collapsed.hiddenLines).toBe(0);
    expect(collapsed.text.toLowerCase()).toContain("hide");
  });

  test("seamless full expansion omits the gap status row entirely", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 3], [1, 3]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expandedGaps: new Map([fullExpansion(gapKey("before", 0), true)]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    expect(result.map((row) => row.type)).toEqual([
      "stack-line",
      "stack-line",
      "stack-line",
      "hunk-header",
    ]);
  });
});

describe("applyGapRequest", () => {
  test("expanding down grows the top edge by one step", () => {
    expect(applyGapRequest(undefined, { kind: "expand", direction: "down" })).toEqual({
      fromStart: GAP_EXPANSION_STEP,
      fromEnd: 0,
    });
    expect(
      applyGapRequest({ fromStart: 5, fromEnd: 3 }, { kind: "expand", direction: "down" }),
    ).toEqual({ fromStart: 5 + GAP_EXPANSION_STEP, fromEnd: 3 });
  });

  test("expanding up grows the bottom edge by one step", () => {
    expect(applyGapRequest(undefined, { kind: "expand", direction: "up" })).toEqual({
      fromStart: 0,
      fromEnd: GAP_EXPANSION_STEP,
    });
  });

  test("expanding all covers the whole gap regardless of prior state", () => {
    expect(
      applyGapRequest({ fromStart: 5, fromEnd: 3 }, { kind: "expand", direction: "all" }),
    ).toEqual({ fromStart: GAP_EXPANSION_ALL, fromEnd: 0 });
  });

  test("collapse resets the gap to its collapsed state", () => {
    expect(applyGapRequest({ fromStart: 5, fromEnd: 3 }, { kind: "collapse" })).toBeNull();
  });
});

describe("seamlessGapExpansionsForFile", () => {
  test("covers every leading gap and the trailing gap seamlessly", () => {
    const metadata = {
      isPartial: false,
      additionLines: Array.from({ length: 30 }, () => ""),
      deletionLines: Array.from({ length: 30 }, () => ""),
      hunks: [
        {
          collapsedBefore: 4,
          additionStart: 5,
          additionCount: 3,
          additionLineIndex: 4,
          deletionStart: 5,
          deletionCount: 3,
          deletionLineIndex: 4,
        },
        {
          collapsedBefore: 10,
          additionStart: 18,
          additionCount: 2,
          additionLineIndex: 17,
          deletionStart: 18,
          deletionCount: 2,
          deletionLineIndex: 17,
        },
      ],
    } as unknown as Parameters<typeof seamlessGapExpansionsForFile>[0];

    const expansions = seamlessGapExpansionsForFile(metadata);
    expect([...expansions.keys()].sort()).toEqual([
      gapKey("before", 0),
      gapKey("before", 1),
      gapKey("trailing", 1),
    ]);
    for (const expansion of expansions.values()) {
      expect(expansion.seamless).toBe(true);
      expect(expansion.fromStart).toBe(GAP_EXPANSION_ALL);
    }
  });
});

describe("selectGapForKeyboardToggle", () => {
  test("returns the leading gap of the selected hunk when one exists", () => {
    const hunks = [{ collapsedBefore: 3 }, { collapsedBefore: 0 }];
    expect(selectGapForKeyboardToggle(hunks, 0, false)).toBe(gapKey("before", 0));
  });

  test("falls forward to the next hunk's leading gap when the selected hunk has none", () => {
    const hunks = [{ collapsedBefore: 0 }, { collapsedBefore: 5 }, { collapsedBefore: 0 }];
    expect(selectGapForKeyboardToggle(hunks, 0, false)).toBe(gapKey("before", 1));
  });

  test("falls back to the trailing gap when no later leading gap exists", () => {
    const hunks = [{ collapsedBefore: 0 }, { collapsedBefore: 0 }];
    expect(selectGapForKeyboardToggle(hunks, 0, true)).toBe(gapKey("trailing", 1));
  });

  test("returns null when no leading or trailing gap is reachable", () => {
    const hunks = [{ collapsedBefore: 0 }, { collapsedBefore: 0 }];
    expect(selectGapForKeyboardToggle(hunks, 0, false)).toBeNull();
  });

  test("returns null for an empty hunk list", () => {
    expect(selectGapForKeyboardToggle([], 0, false)).toBeNull();
  });

  test("clamps a stale selectedHunkIndex into the valid range", () => {
    const hunks = [{ collapsedBefore: 4 }, { collapsedBefore: 0 }];
    // Stale index 99 clamps to the last hunk (1); that hunk has no leading gap,
    // so the trailing gap is the only reachable target.
    expect(selectGapForKeyboardToggle(hunks, 99, true)).toBe(gapKey("trailing", 1));
  });
});
