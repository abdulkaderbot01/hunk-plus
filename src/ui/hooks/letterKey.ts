/**
 * Letter-prefix key extractor for sidebar file jumps.
 *
 * Returns the lowercase letter for unmodified single-letter keypresses, or
 * null for any other input. Used by the keyboard hook to implement
 * vim-style filename jumps.
 */

import type { KeyEvent } from "@opentui/core";

export function extractLetterKey(key: KeyEvent): string | null {
  if (key.ctrl || key.meta || key.option) {
    return null;
  }
  // `key.name` is the human-readable label OpenTUI synthesizes from the input
  // (e.g. "a" for the `a` key). We accept either name or sequence so the prefix
  // also works when the terminal sends raw escape sequences.
  const nameCandidate = key.name && key.name.length > 0 ? key.name : null;
  const candidate = nameCandidate ?? key.sequence;
  if (typeof candidate !== "string" || candidate.length !== 1) {
    return null;
  }
  const lower = candidate.toLowerCase();
  if (lower < "a" || lower > "z") {
    return null;
  }
  if (key.shift) {
    return null;
  }
  return lower;
}
