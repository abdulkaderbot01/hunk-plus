import type { LayoutMode } from "../../core/types";
import type { MenuEntry, MenuId } from "../components/chrome/menu";

export interface BuildAppMenusOptions {
  canFullFileMode: boolean;
  canRefreshCurrentInput: boolean;
  copyDecorations: boolean;
  focusFilter: () => void;
  fullFileMode: boolean;
  gitActionsAvailable: boolean;
  layoutMode: LayoutMode;
  moveToAnnotatedFile: (delta: number) => void;
  moveToAnnotatedHunk: (delta: number) => void;
  moveToHunk: (delta: number) => void;
  openAgentSkill: () => void;
  openThemeSelector: () => void;
  refreshCurrentInput: () => void;
  renderSidebar: boolean;
  requestQuit: () => void;
  selectLayoutMode: (mode: LayoutMode) => void;
  showAgentNotes: boolean;
  showHelp: boolean;
  showHunkHeaders: boolean;
  showLineNumbers: boolean;
  showMenuBar: boolean;
  toggleAgentNotes: () => void;
  toggleCopyDecorations: () => void;
  toggleFocusArea: () => void;
  toggleFullFileMode: () => void;
  toggleHelp: () => void;
  toggleHunkHeaders: () => void;
  toggleLineNumbers: () => void;
  toggleLineWrap: () => void;
  toggleMenuBar: () => void;
  toggleSidebar: () => void;
  triggerDiscardSelectedFile: () => void;
  triggerEditSelectedFile: () => void;
  triggerOpenLazygit: () => void;
  triggerReloadAfterGitAction: () => void;
  triggerStageSelectedFile: () => void;
  triggerUnstageSelectedFile: () => void;
  wrapLines: boolean;
}

/** Build the top-level app menus from the current app state and actions. */
export function buildAppMenus({
  canFullFileMode,
  canRefreshCurrentInput,
  copyDecorations,
  focusFilter,
  fullFileMode,
  gitActionsAvailable,
  layoutMode,
  moveToAnnotatedFile,
  moveToAnnotatedHunk,
  moveToHunk,
  openAgentSkill,
  openThemeSelector,
  refreshCurrentInput,
  renderSidebar,
  requestQuit,
  selectLayoutMode,
  showAgentNotes,
  showHelp,
  showHunkHeaders,
  showLineNumbers,
  showMenuBar,
  toggleAgentNotes,
  toggleCopyDecorations,
  toggleFocusArea,
  toggleFullFileMode,
  toggleHelp,
  toggleHunkHeaders,
  toggleLineNumbers,
  toggleLineWrap,
  toggleMenuBar,
  toggleSidebar,
  triggerDiscardSelectedFile,
  triggerEditSelectedFile,
  triggerOpenLazygit,
  triggerReloadAfterGitAction,
  triggerStageSelectedFile,
  triggerUnstageSelectedFile,
  wrapLines,
}: BuildAppMenusOptions): Record<MenuId, MenuEntry[]> {
  // gitActionsAvailable is plumbed through so future per-session gating can flip
  // menu items off without the call site having to drop them. The current
  // implementation always enables the items; the flag is wired but inactive.
  void gitActionsAvailable;

  const fileMenuEntries: MenuEntry[] = [
    {
      kind: "item",
      label: "Toggle files/filter focus",
      hint: "Tab",
      action: toggleFocusArea,
    },
    {
      kind: "item",
      label: "Focus filter",
      hint: "/",
      action: focusFilter,
    },
    {
      kind: "item",
      label: "Open file in editor",
      hint: "e",
      action: triggerEditSelectedFile,
    },
  ];

  if (canRefreshCurrentInput) {
    fileMenuEntries.push({
      kind: "item",
      label: "Reload",
      hint: "r",
      action: refreshCurrentInput,
    });
  }

  fileMenuEntries.push(
    { kind: "separator" },
    {
      kind: "item",
      label: "Quit",
      hint: "q",
      action: requestQuit,
    },
  );

  return {
    file: fileMenuEntries,
    view: [
      {
        kind: "item",
        label: "Split view",
        hint: "1",
        checked: layoutMode === "split",
        action: () => selectLayoutMode("split"),
      },
      {
        kind: "item",
        label: "Stacked view",
        hint: "2",
        checked: layoutMode === "stack",
        action: () => selectLayoutMode("stack"),
      },
      {
        kind: "item",
        label: "Auto layout",
        hint: "0",
        checked: layoutMode === "auto",
        action: () => selectLayoutMode("auto"),
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Sidebar",
        hint: "s",
        checked: renderSidebar,
        action: toggleSidebar,
      },
      {
        kind: "item",
        label: "Menu bar",
        hint: "M",
        checked: showMenuBar,
        action: toggleMenuBar,
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Themes…",
        hint: "t",
        action: openThemeSelector,
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Agent notes",
        hint: "a",
        checked: showAgentNotes,
        action: toggleAgentNotes,
      },
      {
        kind: "item",
        label: "Line numbers",
        hint: "l",
        checked: showLineNumbers,
        action: toggleLineNumbers,
      },
      {
        kind: "item",
        label: "Line wrapping",
        hint: "w",
        checked: wrapLines,
        action: toggleLineWrap,
      },
      {
        kind: "item",
        label: "Hunk metadata",
        hint: "m",
        checked: showHunkHeaders,
        action: toggleHunkHeaders,
      },
      {
        kind: "item",
        label: "Copy decorations",
        checked: copyDecorations,
        action: toggleCopyDecorations,
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "View full file",
        hint: "V",
        checked: fullFileMode,
        // canFullFileMode is plumbed for callers that want to disable the
        // toggle when no file in the current review has a source fetcher.
        // The action is still wired so the menu state stays consistent if
        // the user selects the item while no source is available.
        action: () => {
          if (canFullFileMode) {
            toggleFullFileMode();
          }
        },
      },
    ],
    navigate: [
      {
        kind: "item",
        label: "Previous hunk",
        hint: "[",
        action: () => moveToHunk(-1),
      },
      {
        kind: "item",
        label: "Next hunk",
        hint: "]",
        action: () => moveToHunk(1),
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Previous comment",
        hint: "{",
        action: () => moveToAnnotatedHunk(-1),
      },
      {
        kind: "item",
        label: "Next comment",
        hint: "}",
        action: () => moveToAnnotatedHunk(1),
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Focus filter",
        hint: "/",
        action: focusFilter,
      },
    ],
    git: [
      {
        kind: "item",
        label: "Open lazygit",
        hint: "Ctrl+L",
        action: triggerOpenLazygit,
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Stage file",
        hint: "g s",
        action: () => {
          triggerStageSelectedFile();
          // Reload after the action so the diff reflects the new index state.
          triggerReloadAfterGitAction();
        },
      },
      {
        kind: "item",
        label: "Unstage file",
        hint: "g u",
        action: () => {
          triggerUnstageSelectedFile();
          triggerReloadAfterGitAction();
        },
      },
      {
        kind: "item",
        label: "Discard worktree changes",
        hint: "g d",
        action: () => {
          triggerDiscardSelectedFile();
          triggerReloadAfterGitAction();
        },
      },
    ],
    agent: [
      {
        kind: "item",
        label: "Agent notes",
        hint: "a",
        checked: showAgentNotes,
        action: toggleAgentNotes,
      },
      {
        kind: "item",
        label: "Agent skill",
        action: openAgentSkill,
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Next annotated file",
        action: () => moveToAnnotatedFile(1),
      },
      {
        kind: "item",
        label: "Previous annotated file",
        action: () => moveToAnnotatedFile(-1),
      },
    ],
    help: [
      {
        kind: "item",
        label: "Controls help",
        hint: "?",
        checked: showHelp,
        action: toggleHelp,
      },
    ],
  };
}
