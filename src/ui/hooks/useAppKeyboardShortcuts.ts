import type { KeyEvent } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useRef } from "react";
import type { LayoutMode } from "../../core/types";
import type { MenuId } from "../components/chrome/menu";
import {
  isCreateReviewNoteKey,
  isEscapeKey,
  isHalfPageDownKey,
  isHalfPageUpKey,
  isPageDownKey,
  isPageUpKey,
  isSaveDraftNoteKey,
  isShiftSpacePageUpKey,
  isStepDownKey,
  isStepUpKey,
} from "../lib/keyboard";
import { extractLetterKey } from "./letterKey";

type FocusArea = "files" | "filter" | "note";
type ScrollUnit = "step" | "viewport" | "content" | "half";

const FAST_CODE_HORIZONTAL_SCROLL_COLUMNS = 8;

type JumpShortcut = "top" | "bottom";

/** Detect an unmodified lowercase g keypress. */
function isLowercaseGKey(key: KeyEvent) {
  return (
    (key.name === "g" || key.sequence === "g") &&
    !key.shift &&
    !key.option &&
    !key.ctrl &&
    !key.meta
  );
}

/** Detect an unmodified uppercase G keypress. */
function isUppercaseGKey(key: KeyEvent) {
  return (
    (key.sequence === "G" && !key.option && !key.ctrl && !key.meta) ||
    (key.name === "g" && key.shift && !key.option && !key.ctrl && !key.meta)
  );
}

/** Detect Shift-M without stealing the lowercase hunk metadata toggle. */
function isUppercaseMKey(key: KeyEvent) {
  return (
    (key.sequence === "M" && !key.option && !key.ctrl && !key.meta) ||
    (key.name === "m" && key.shift && !key.option && !key.ctrl && !key.meta)
  );
}

export interface UseAppKeyboardShortcutsOptions {
  acceptThemeSelector: () => void;
  activateCurrentMenuItem: () => void;
  activeMenuId: MenuId | null;
  canRefreshCurrentInput: boolean;
  cancelDraftNote: () => void;
  closeAgentSkill: () => void;
  closeHelp: () => void;
  closeMenu: () => void;
  closeThemeSelector: () => void;
  focusArea: FocusArea;
  focusFilter: () => void;
  moveToAnnotatedHunk: (delta: number) => void;
  moveToFile: (delta: number) => void;
  moveToHunk: (delta: number) => void;
  moveMenuItem: (delta: number) => void;
  moveThemeSelector: (delta: number) => void;
  openMenu: (menuId: MenuId) => void;
  openThemeSelector: () => void;
  pagerMode: boolean;
  requestQuit: () => void;
  scrollCodeHorizontally: (delta: number) => void;
  scrollDiff: (delta: number, unit: ScrollUnit) => void;
  saveDraftNote: () => void;
  selectLayoutMode: (mode: LayoutMode) => void;
  showAgentSkill: boolean;
  showHelp: boolean;
  startUserNote: () => void;
  switchMenu: (delta: number) => void;
  toggleAgentNotes: () => void;
  toggleFocusArea: () => void;
  toggleGapForSelectedHunk: () => void;
  toggleHelp: () => void;
  toggleHunkHeaders: () => void;
  toggleLineNumbers: () => void;
  toggleMenuBar: () => void;
  toggleLineWrap: () => void;
  themeSelectorOpen: boolean;
  toggleSidebar: () => void;
  triggerEditSelectedFile: () => void;
  triggerRefreshCurrentInput: () => void;
  // Git + full-file actions
  triggerOpenLazygit: () => void;
  triggerStageSelectedFile: () => void;
  triggerUnstageSelectedFile: () => void;
  triggerDiscardSelectedFile: () => void;
  triggerReloadAfterGitAction: () => void;
  toggleFullFileMode: () => void;
  // Sidebar navigation
  jumpToFileByLetter: (letter: string) => boolean;
  jumpToAdjacentFile: (delta: -1 | 1) => void;
}

/** Register the app's scoped keyboard handling while keeping mode precedence explicit. */
export function useAppKeyboardShortcuts({
  activeMenuId,
  activateCurrentMenuItem,
  canRefreshCurrentInput,
  closeAgentSkill,
  closeHelp,
  closeMenu,
  acceptThemeSelector,
  cancelDraftNote,
  closeThemeSelector,
  focusArea,
  focusFilter,
  moveToAnnotatedHunk,
  moveToFile,
  moveToHunk,
  moveMenuItem,
  moveThemeSelector,
  openMenu,
  openThemeSelector,
  pagerMode,
  requestQuit,
  scrollCodeHorizontally,
  saveDraftNote,
  scrollDiff,
  selectLayoutMode,
  showAgentSkill,
  showHelp,
  startUserNote,
  switchMenu,
  toggleAgentNotes,
  toggleFocusArea,
  toggleGapForSelectedHunk,
  toggleHelp,
  themeSelectorOpen,
  toggleHunkHeaders,
  toggleMenuBar,
  triggerEditSelectedFile,
  toggleLineNumbers,
  toggleLineWrap,
  toggleSidebar,
  triggerRefreshCurrentInput,
  triggerOpenLazygit,
  triggerStageSelectedFile,
  triggerUnstageSelectedFile,
  triggerDiscardSelectedFile,
  triggerReloadAfterGitAction,
  toggleFullFileMode,
  jumpToFileByLetter,
  jumpToAdjacentFile,
}: UseAppKeyboardShortcutsOptions) {
  const activeMenuIdRef = useRef(activeMenuId);
  const focusAreaRef = useRef(focusArea);
  const pagerModeRef = useRef(pagerMode);
  const showAgentSkillRef = useRef(showAgentSkill);
  const showHelpRef = useRef(showHelp);
  const themeSelectorOpenRef = useRef(themeSelectorOpen);
  // Tracks a pending "g" prefix for the git submenu shortcuts (g s / g u / g d).
  const pendingGPrefixRef = useRef(false);
  // Tracks a pending letter prefix for sidebar filename jumps.
  const pendingLetterPrefixRef = useRef<{ letter: string; at: number } | null>(null);
  const LETTER_PREFIX_TIMEOUT_MS = 1000;

  activeMenuIdRef.current = activeMenuId;
  focusAreaRef.current = focusArea;
  pagerModeRef.current = pagerMode;
  showAgentSkillRef.current = showAgentSkill;
  showHelpRef.current = showHelp;
  themeSelectorOpenRef.current = themeSelectorOpen;

  const resolveJumpShortcut = (key: KeyEvent): JumpShortcut | null => {
    if (isUppercaseGKey(key)) {
      return "bottom";
    }

    if (isLowercaseGKey(key)) {
      return "top";
    }

    return null;
  };

  const runAndCloseMenu = (action: () => void) => {
    action();
    closeMenu();
  };

  const consumeKey = (key: KeyEvent) => {
    key.preventDefault();
    key.stopPropagation();
  };

  const handleMenuToggleShortcut = (key: KeyEvent) => {
    if (key.name !== "f10") {
      return false;
    }

    if (pagerModeRef.current) {
      return true;
    }

    if (activeMenuIdRef.current) {
      closeMenu();
    } else {
      openMenu("file");
    }

    return true;
  };

  const handlePagerShortcut = (key: KeyEvent) => {
    const jumpShortcut = resolveJumpShortcut(key);
    if (jumpShortcut === "top") {
      scrollDiff(-1, "content");
      return;
    }

    if (jumpShortcut === "bottom") {
      scrollDiff(1, "content");
      return;
    }

    if (key.name === "q" || isEscapeKey(key)) {
      requestQuit();
      return;
    }

    if (isPageDownKey(key)) {
      scrollDiff(1, "viewport");
      return;
    }

    if (isPageUpKey(key) || isShiftSpacePageUpKey(key)) {
      scrollDiff(-1, "viewport");
      return;
    }

    if (isHalfPageDownKey(key)) {
      scrollDiff(1, "half");
      return;
    }

    if (isHalfPageUpKey(key)) {
      scrollDiff(-1, "half");
      return;
    }

    if (isStepDownKey(key)) {
      scrollDiff(1, "step");
      return;
    }

    if (isStepUpKey(key)) {
      scrollDiff(-1, "step");
      return;
    }

    if (key.name === "left") {
      scrollCodeHorizontally(key.shift ? -FAST_CODE_HORIZONTAL_SCROLL_COLUMNS : -1);
      return;
    }

    if (key.name === "right") {
      scrollCodeHorizontally(key.shift ? FAST_CODE_HORIZONTAL_SCROLL_COLUMNS : 1);
      return;
    }

    if (key.name === "home") {
      scrollDiff(-1, "content");
      return;
    }

    if (key.name === "end") {
      scrollDiff(1, "content");
      return;
    }

    if (key.name === "w" || key.sequence === "w") {
      toggleLineWrap();
      return;
    }

    if (key.name === "s" || key.sequence === "s") {
      toggleSidebar();
    }
  };

  const handleDialogShortcut = (key: KeyEvent) => {
    if (!isEscapeKey(key)) {
      return false;
    }

    if (showAgentSkillRef.current) {
      closeAgentSkill();
      return true;
    }

    if (showHelpRef.current) {
      closeHelp();
      return true;
    }

    return false;
  };

  const handleThemeSelectorShortcut = (key: KeyEvent) => {
    if (!themeSelectorOpenRef.current) {
      return false;
    }

    if (isEscapeKey(key)) {
      consumeKey(key);
      closeThemeSelector();
      return true;
    }

    if (key.name === "up") {
      consumeKey(key);
      moveThemeSelector(-1);
      return true;
    }

    if (key.name === "down") {
      consumeKey(key);
      moveThemeSelector(1);
      return true;
    }

    if (key.name === "tab") {
      consumeKey(key);
      moveThemeSelector(key.shift ? -1 : 1);
      return true;
    }

    if (key.name === "return" || key.name === "enter") {
      consumeKey(key);
      acceptThemeSelector();
      return true;
    }

    return true;
  };

  const handleMenuShortcut = (key: KeyEvent) => {
    if (!activeMenuIdRef.current) {
      return false;
    }

    if (isEscapeKey(key)) {
      closeMenu();
      return true;
    }

    if (key.name === "left") {
      switchMenu(-1);
      return true;
    }

    if (key.name === "right" || key.name === "tab") {
      switchMenu(1);
      return true;
    }

    if (key.name === "up") {
      moveMenuItem(-1);
      return true;
    }

    if (key.name === "down") {
      moveMenuItem(1);
      return true;
    }

    if (key.name === "return" || key.name === "enter") {
      activateCurrentMenuItem();
      return true;
    }

    return false;
  };

  const handleFocusedInputShortcut = (key: KeyEvent) => {
    if (focusAreaRef.current === "filter") {
      if (key.name === "tab") {
        toggleFocusArea();
        return true;
      }

      // Let the focused input own filter editing and escape handling.
      return true;
    }

    if (focusAreaRef.current !== "note") {
      return false;
    }

    if (isEscapeKey(key)) {
      consumeKey(key);
      cancelDraftNote();
      return true;
    }

    if (isSaveDraftNoteKey(key)) {
      consumeKey(key);
      saveDraftNote();
      return true;
    }

    // Let the focused inline note input own text editing.
    return true;
  };

  const handleAppShortcut = (key: KeyEvent) => {
    const jumpShortcut = resolveJumpShortcut(key);
    if (jumpShortcut === "bottom") {
      scrollDiff(1, "content");
      return;
    }
    // Lowercase `g` is handled in the git-prefix block below so it can both jump-to-top
    // AND arm the `g g` lazygit prefix. The uppercase `G` jump-to-bottom still flows
    // through `resolveJumpShortcut`.

    if (key.name === "q") {
      requestQuit();
      return;
    }

    if (key.name === "?" || key.sequence === "?") {
      toggleHelp();
      closeMenu();
      return;
    }
    if (isEscapeKey(key)) {
      requestQuit();
      return;
    }

    // Ctrl+L opens lazygit. Avoids the existing g/G jump-to-top bindings.
    if (
      key.ctrl &&
      !key.shift &&
      !key.meta &&
      !key.option &&
      (key.name === "l" || key.sequence === "l")
    ) {
      runAndCloseMenu(() => {
        triggerOpenLazygit();
      });
      return;
    }

    // V (shift+v) toggles full-file view. Avoids v as a free letter for the prefix.
    if (
      key.shift &&
      !key.ctrl &&
      !key.meta &&
      !key.option &&
      (key.name === "v" || key.sequence === "V")
    ) {
      runAndCloseMenu(toggleFullFileMode);
      return;
    }

    // J / K always step between files regardless of focus state, so users get
    // a stable "next/prev file" binding even when the sidebar is hidden.
    if (!key.ctrl && !key.meta && !key.option && (key.name === "J" || key.sequence === "J")) {
      runAndCloseMenu(() => jumpToAdjacentFile(1));
      return;
    }
    if (!key.ctrl && !key.meta && !key.option && (key.name === "K" || key.sequence === "K")) {
      runAndCloseMenu(() => jumpToAdjacentFile(-1));
      return;
    }

    // "g" prefix for git file actions: g s = stage, g u = unstage, g d = discard.
    // The first g also performs the less-style top jump so the prefix never silently
    // swallows the key — the user gets the jump AND arms a 1s window for the second key.
    if (isLowercaseGKey(key)) {
      if (pendingGPrefixRef.current) {
        runAndCloseMenu(triggerOpenLazygit);
        pendingGPrefixRef.current = false;
        return;
      }
      scrollDiff(-1, "content");
      pendingGPrefixRef.current = true;
      setTimeout(() => {
        pendingGPrefixRef.current = false;
      }, 1000);
      return;
    }
    if (pendingGPrefixRef.current) {
      pendingGPrefixRef.current = false;
      if (key.name === "s" || key.sequence === "s") {
        runAndCloseMenu(() => {
          triggerStageSelectedFile();
          triggerReloadAfterGitAction();
        });
        return;
      }
      if (key.name === "u" || key.sequence === "u") {
        runAndCloseMenu(() => {
          triggerUnstageSelectedFile();
          triggerReloadAfterGitAction();
        });
        return;
      }
      if (key.name === "d" || key.sequence === "d") {
        runAndCloseMenu(() => {
          triggerDiscardSelectedFile();
          triggerReloadAfterGitAction();
        });
        return;
      }
    }

    if (key.name === "tab") {
      toggleFocusArea();
      return;
    }
    if (key.name === "/") {
      focusFilter();
      return;
    }

    if (isCreateReviewNoteKey(key)) {
      runAndCloseMenu(startUserNote);
      return;
    }

    if (isPageDownKey(key)) {
      scrollDiff(1, "viewport");
      return;
    }

    if (isPageUpKey(key) || isShiftSpacePageUpKey(key)) {
      scrollDiff(-1, "viewport");
      return;
    }

    if (isHalfPageDownKey(key)) {
      scrollDiff(1, "half");
      return;
    }

    if (isHalfPageUpKey(key)) {
      scrollDiff(-1, "half");
      return;
    }

    if (key.name === "home") {
      scrollDiff(-1, "content");
      return;
    }

    if (key.name === "end") {
      scrollDiff(1, "content");
      return;
    }

    if (isStepUpKey(key)) {
      scrollDiff(-1, "step");
      return;
    }

    if (isStepDownKey(key)) {
      scrollDiff(1, "step");
      return;
    }

    if (key.name === "left") {
      scrollCodeHorizontally(key.shift ? -FAST_CODE_HORIZONTAL_SCROLL_COLUMNS : -1);
      return;
    }

    if (key.name === "right") {
      scrollCodeHorizontally(key.shift ? FAST_CODE_HORIZONTAL_SCROLL_COLUMNS : 1);
      return;
    }

    if (key.name === "1") {
      runAndCloseMenu(() => selectLayoutMode("split"));
      return;
    }

    if (key.name === "2") {
      runAndCloseMenu(() => selectLayoutMode("stack"));
      return;
    }

    if (key.name === "0") {
      runAndCloseMenu(() => selectLayoutMode("auto"));
      return;
    }

    if (key.name === "s") {
      runAndCloseMenu(toggleSidebar);
      return;
    }

    if ((key.name === "r" || key.sequence === "r") && canRefreshCurrentInput) {
      runAndCloseMenu(triggerRefreshCurrentInput);
      return;
    }

    if (key.name === "t") {
      runAndCloseMenu(openThemeSelector);
      return;
    }

    if (key.name === "a") {
      runAndCloseMenu(toggleAgentNotes);
      return;
    }

    if (key.name === "l" || key.sequence === "l") {
      runAndCloseMenu(toggleLineNumbers);
      return;
    }

    if (key.name === "w" || key.sequence === "w") {
      runAndCloseMenu(toggleLineWrap);
      return;
    }

    if (isUppercaseMKey(key)) {
      runAndCloseMenu(toggleMenuBar);
      return;
    }

    if (key.name === "m" || key.sequence === "m") {
      runAndCloseMenu(toggleHunkHeaders);
      return;
    }

    if (key.name === "z" || key.sequence === "z") {
      runAndCloseMenu(toggleGapForSelectedHunk);
      return;
    }

    if (key.name === "e" || key.sequence === "e") {
      runAndCloseMenu(triggerEditSelectedFile);
      return;
    }

    if (key.name === "[") {
      runAndCloseMenu(() => moveToHunk(-1));
      return;
    }

    if (key.name === "]") {
      runAndCloseMenu(() => moveToHunk(1));
      return;
    }

    if (key.name === "," || key.sequence === ",") {
      runAndCloseMenu(() => moveToFile(-1));
      return;
    }

    if (key.name === "." || key.sequence === ".") {
      runAndCloseMenu(() => moveToFile(1));
      return;
    }

    if (key.sequence === "{") {
      runAndCloseMenu(() => moveToAnnotatedHunk(-1));
      return;
    }

    if (key.sequence === "}") {
      runAndCloseMenu(() => moveToAnnotatedHunk(1));
      return;
    }

    // Letter prefix for sidebar file jumps, as the lowest-precedence fallback so
    // reserved single-letter shortcuts (a, s, t, w, z, …) keep their bindings.
    // Any remaining unmodified letter cycles through files whose display name
    // starts with that letter; pressing the same letter again advances to the
    // next match. The window expires after LETTER_PREFIX_TIMEOUT_MS.
    const letterMatch = extractLetterKey(key);
    if (letterMatch) {
      const now = Date.now();
      const pending = pendingLetterPrefixRef.current;
      const sameLetter =
        pending && pending.letter === letterMatch && now - pending.at < LETTER_PREFIX_TIMEOUT_MS;
      pendingLetterPrefixRef.current = { letter: letterMatch, at: now };
      if (!jumpToFileByLetter(letterMatch) && !sameLetter) {
        pendingLetterPrefixRef.current = null;
      }
    } else {
      // Reset the letter prefix on any non-letter keypress so the window doesn't
      // outlive unrelated navigation.
      pendingLetterPrefixRef.current = null;
    }
  };

  useKeyboard((key: KeyEvent) => {
    if (handleMenuToggleShortcut(key)) {
      return;
    }

    if (pagerModeRef.current) {
      handlePagerShortcut(key);
      return;
    }

    if (handleDialogShortcut(key)) {
      return;
    }

    if (handleThemeSelectorShortcut(key)) {
      return;
    }

    if (handleMenuShortcut(key)) {
      return;
    }

    if (handleFocusedInputShortcut(key)) {
      return;
    }

    handleAppShortcut(key);
  });
}
