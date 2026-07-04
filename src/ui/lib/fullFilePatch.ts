/**
 * Build a synthetic full-file diff from per-side source text.
 *
 * The main review stream shows only hunk-bearing context rows. The "view full
 * file" mode swaps in a diff that covers every line of the file, using the same
 * `parseDiffFromFile` + `createTwoFilesPatch` shape the rest of the app already
 * expects.
 */

import { createTwoFilesPatch, type CreatePatchOptionsNonabortable } from "diff";
import { parseDiffFromFile, type FileContents, type FileDiffMetadata } from "@pierre/diffs";

export interface BuildFullFileDiffOptions {
  /** Display path used in patch headers (e.g. `src/ui/App.tsx`). */
  path: string;
  /** Old-side full text, or `null` for a new file. */
  oldText: string | null;
  /** New-side full text, or `null` for a deleted file. */
  newText: string | null;
  /** Optional path the old text came from; falls back to `path`. */
  previousPath?: string;
  /** Lines of context to keep around each change. Defaults to 3. */
  context?: number;
  /** Optional override for the patch `cacheKey` to keep this diff stable across reloads. */
  cacheKey?: string;
}

export interface FullFileDiff {
  patch: string;
  metadata: FileDiffMetadata;
}

const DEFAULT_CONTEXT = 3;

function pad(text: string | null): string {
  // Pierre expects trailing newlines for non-empty files; null/empty short-circuits.
  if (text === null || text === "") {
    return "";
  }
  return text.endsWith("\n") ? text : `${text}\n`;
}

function buildMetadata({
  path,
  oldText,
  newText,
  previousPath,
  context = DEFAULT_CONTEXT,
  cacheKey,
}: BuildFullFileDiffOptions): FileDiffMetadata {
  const oldContents: FileContents = {
    name: previousPath ?? path,
    contents: pad(oldText),
    cacheKey: `${cacheKey ?? path}:full:old`,
  };
  const newContents: FileContents = {
    name: path,
    contents: pad(newText),
    cacheKey: `${cacheKey ?? path}:full:new`,
  };
  return parseDiffFromFile(oldContents, newContents, { context }, true);
}

function buildPatch({
  path,
  oldText,
  newText,
  previousPath,
  context = DEFAULT_CONTEXT,
}: BuildFullFileDiffOptions): string {
  const oldName = previousPath ?? path;
  const newName = path;
  // Emit git-style `a/`+`b/` headers with `/dev/null` for missing sides so patch
  // consumers (and Pierre) classify new vs deleted files correctly.
  const fromLabel = oldText === null ? "/dev/null" : `a/${oldName}`;
  const toLabel = newText === null ? "/dev/null" : `b/${newName}`;
  const options: CreatePatchOptionsNonabortable = { context };
  const unified = createTwoFilesPatch(
    fromLabel,
    toLabel,
    pad(oldText),
    pad(newText),
    "",
    "",
    options,
  );
  // `diff` prepends an `Index:`/`===` banner; replace it with a git-style
  // `diff --git` line so the patch reads like real git output.
  const headerStart = unified.indexOf("--- ");
  const body = headerStart >= 0 ? unified.slice(headerStart) : unified;
  return `diff --git a/${oldName} b/${newName}\n${body}`;
}

/** Build a `parseDiffFromFile`-shaped metadata + unified diff patch for one full file. */
export function buildFullFileDiff(options: BuildFullFileDiffOptions): FullFileDiff {
  return {
    patch: buildPatch(options),
    metadata: buildMetadata(options),
  };
}
