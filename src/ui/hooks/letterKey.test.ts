/**
 * Unit tests for the letter-prefix key extractor.
 */

import { describe, expect, test } from "bun:test";
import type { KeyEvent } from "@opentui/core";
import { extractLetterKey } from "./letterKey";

function makeKey(overrides: Partial<KeyEvent> = {}): KeyEvent {
  return {
    name: "",
    sequence: "",
    ...overrides,
  } as KeyEvent;
}

describe("extractLetterKey", () => {
  test("returns the lowercase letter for unmodified single letters", () => {
    expect(extractLetterKey(makeKey({ name: "a" }))).toBe("a");
    expect(extractLetterKey(makeKey({ name: "Z" }))).toBe("z");
  });

  test("falls back to `sequence` when `name` is missing", () => {
    expect(extractLetterKey(makeKey({ sequence: "k" }))).toBe("k");
  });

  test("ignores keys that are not single ASCII letters", () => {
    expect(extractLetterKey(makeKey({ name: "1" }))).toBeNull();
    expect(extractLetterKey(makeKey({ name: "space" }))).toBeNull();
    expect(extractLetterKey(makeKey({ name: "?" }))).toBeNull();
  });

  test("ignores shift-modified keys", () => {
    expect(extractLetterKey(makeKey({ name: "V", shift: true }))).toBeNull();
    expect(extractLetterKey(makeKey({ name: "K", shift: true }))).toBeNull();
  });

  test("ignores control / meta / option modifiers", () => {
    expect(extractLetterKey(makeKey({ name: "l", ctrl: true }))).toBeNull();
    expect(extractLetterKey(makeKey({ name: "l", meta: true }))).toBeNull();
    expect(extractLetterKey(makeKey({ name: "l", option: true }))).toBeNull();
  });
});
