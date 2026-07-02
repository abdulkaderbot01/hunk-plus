/**
 * Return whether any file in the review stream can be expanded to its full
 * source view. Used to gate the "View full file" menu entry and shortcut.
 */

import type { DiffFile } from "../../core/types";

export function isAnyFileFullFileAvailable(files: DiffFile[]): boolean {
  return files.some((file) => Boolean(file.sourceFetcher));
}
