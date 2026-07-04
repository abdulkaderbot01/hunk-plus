import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createPtyHarness } from "./harness";

const harness = createPtyHarness();

/** Give PTY-backed startup and redraws enough headroom for slower CI machines. */
setDefaultTimeout(20_000);

afterEach(() => {
  harness.cleanup();
});

describe("PTY gap expansion", () => {
  test("directional chips expand a collapsed gap from either edge and then fully", async () => {
    const fixture = harness.createCollapsedTopRepoFixture();
    const session = await harness.launchHunk({
      args: ["diff", "--mode", "split"],
      cwd: fixture.dir,
      cols: 220,
      rows: 30,
    });

    try {
      const initial = await session.waitForText(/View\s+Navigate\s+Git\s+Agent\s+Help/, {
        timeout: 15_000,
      });
      expect(initial).toContain("▾ 362 unchanged lines");
      expect(initial).toContain("[↓ 20]");
      expect(initial).toContain("[↑ 20]");
      expect(initial).toContain("[↕ all]");

      // Expand 20 lines below the hunk above the gap (the top edge).
      await session.click(/\[↓ 20\]/);
      const afterDown = await harness.waitForSnapshot(
        session,
        (text) => text.includes("342 unchanged lines"),
        10_000,
      );
      expect(afterDown).toContain("line001 = 1;");

      // Expand 20 more lines above the hunk below the gap (the bottom edge).
      await session.click(/\[↑ 20\]/);
      await harness.waitForSnapshot(
        session,
        (text) => text.includes("322 unchanged lines"),
        10_000,
      );

      // Expand the remainder in one step.
      await session.click(/\[↕ all\]/);
      const fullyExpanded = await harness.waitForSnapshot(
        session,
        (text) => text.includes("Hide 362 unchanged lines"),
        10_000,
      );
      expect(fullyExpanded).not.toContain("[↓ 20]");

      // Clicking the expanded status row collapses the gap back down.
      await session.click(/Hide 362 unchanged lines/);
      await harness.waitForSnapshot(
        session,
        (text) => text.includes("▾ 362 unchanged lines"),
        10_000,
      );
    } finally {
      session.close();
    }
  });

  test("full-file view renders the whole file continuously and toggles back", async () => {
    const fixture = harness.createCollapsedTopRepoFixture();
    const session = await harness.launchHunk({
      args: ["diff", "--mode", "split"],
      cwd: fixture.dir,
      cols: 220,
      rows: 30,
    });

    try {
      const initial = await session.waitForText(/View\s+Navigate\s+Git\s+Agent\s+Help/, {
        timeout: 15_000,
      });
      expect(initial).toContain("▾ 362 unchanged lines");
      expect(initial).not.toContain("line001 = 1;");

      // Shift+V swaps in the seamless full-file listing: the leading gap
      // disappears and the file starts from its first line.
      await session.type("V");
      const fullFile = await harness.waitForSnapshot(
        session,
        (text) => text.includes("line001 = 1;"),
        15_000,
      );
      expect(fullFile).not.toContain("unchanged lines");

      // Toggling again restores the collapsed review stream.
      await session.type("V");
      await harness.waitForSnapshot(
        session,
        (text) => text.includes("▾ 362 unchanged lines"),
        10_000,
      );
    } finally {
      session.close();
    }
  });
});
