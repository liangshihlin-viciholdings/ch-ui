// useVimAppNav.ts
// App-wide vim navigation, gated by the single Vim Mode toggle
// (editorStore.vimMode). Mounted once in the root layout. It owns exactly three
// things and nothing pane-local:
//   1. gate + guards (skip typing fields, open overlays, and CodeMirror insert mode)
//   2. Ctrl+h/j/k/l  → move focus to the nearest pane in that direction
//   3. gt / gT       → cycle workbench query tabs (workbench route only)
//
// Panes are discovered from the DOM via [data-vim-pane]; there is no registry
// store. "Current pane" = document.activeElement.closest('[data-vim-pane]').
// Pane-local cursors (sidebar tree, result cells) live with their own data, not
// here.

import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { EditorView } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";
import { useEditorVimMode } from "@/stores/editorStore";
import { getWorkbenchState, setActiveTab } from "@/stores/workbenchStore";

// ─── Pure geometry: nearest pane in a direction ────────────────────────────
export type VimDir = "h" | "j" | "k" | "l";

export interface PaneBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Given the current pane's box and a set of candidate panes, return the nearest
 * candidate lying in `dir` from the current box, or null. Horizontal moves
 * (h/l) require vertical overlap; vertical moves (j/k) require horizontal
 * overlap — so adjacent-but-offset panes don't jump diagonally. Ties on the
 * primary axis break toward the candidate whose center is closest on the
 * perpendicular axis. Pure and DOM-free so it can be unit-tested.
 */
export function resolvePaneInDirection<T extends { rect: PaneBox }>(
  current: PaneBox,
  candidates: T[],
  dir: VimDir,
): T | null {
  const cx = (current.left + current.right) / 2;
  const cy = (current.top + current.bottom) / 2;
  const horizontal = dir === "h" || dir === "l";
  const positive = dir === "l" || dir === "j"; // right / down

  let best: T | null = null;
  let bestPrimary = Infinity;
  let bestSecondary = Infinity;

  for (const c of candidates) {
    const r = c.rect;
    const rx = (r.left + r.right) / 2;
    const ry = (r.top + r.bottom) / 2;

    let primary: number;
    let secondary: number;

    if (horizontal) {
      if (!(r.top < current.bottom && r.bottom > current.top)) continue; // need vertical overlap
      const delta = rx - cx;
      if (positive ? delta <= 1 : delta >= -1) continue; // must be to the right/left
      primary = Math.abs(delta);
      secondary = Math.abs(ry - cy);
    } else {
      if (!(r.left < current.right && r.right > current.left)) continue; // need horizontal overlap
      const delta = ry - cy;
      if (positive ? delta <= 1 : delta >= -1) continue; // must be below/above
      primary = Math.abs(delta);
      secondary = Math.abs(rx - cx);
    }

    if (
      primary < bestPrimary - 0.5 ||
      (Math.abs(primary - bestPrimary) <= 0.5 && secondary < bestSecondary)
    ) {
      best = c;
      bestPrimary = primary;
      bestSecondary = secondary;
    }
  }

  return best;
}

// ─── DOM helpers ────────────────────────────────────────────────────────────

/** Panes that contain no other pane — the only valid focus targets. */
function leafPanes(): HTMLElement[] {
  const all = Array.from(
    document.querySelectorAll<HTMLElement>("[data-vim-pane]"),
  );
  return all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
}

/** Move focus into a pane: prefer its CodeMirror editor, else the pane itself. */
function focusPane(el: HTMLElement): void {
  const cm = el.querySelector<HTMLElement>(".cm-content");
  (cm ?? el).focus();
}

function boxOf(el: HTMLElement): PaneBox {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

function isTypingContext(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable === true;
}

/** activeElement sits inside an open modal/menu/listbox that owns its own keys. */
function isOverlayOpen(el: Element | null): boolean {
  return !!el?.closest(
    '[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"]',
  );
}

/** True only when focus is inside a CodeMirror editor that is in insert mode. */
function inCmInsertMode(el: Element | null): boolean {
  const cmEl = el?.closest<HTMLElement>(".cm-editor");
  if (!cmEl) return false;
  const view = EditorView.findFromDOM(cmEl);
  const cm = view ? getCM(view) : null;
  const vim = (cm?.state as { vim?: { insertMode?: boolean } } | undefined)?.vim;
  return vim?.insertMode === true;
}

function movePane(dir: VimDir): void {
  const leaves = leafPanes();
  if (!leaves.length) return;
  const currentEl =
    document.activeElement?.closest<HTMLElement>("[data-vim-pane]") ?? null;
  if (!currentEl) {
    focusPane(leaves[0]);
    return;
  }
  const candidates = leaves
    .filter((el) => el !== currentEl && !el.contains(currentEl))
    .map((el) => ({ el, rect: boxOf(el) }));
  const chosen = resolvePaneInDirection(boxOf(currentEl), candidates, dir);
  if (chosen) focusPane(chosen.el);
}

function cycleWorkbenchTab(delta: number): void {
  const { tabs, activeTabId } = getWorkbenchState();
  if (!tabs.length) return;
  const idx = tabs.findIndex((t) => t.id === activeTabId);
  if (idx < 0) return;
  setActiveTab(tabs[(idx + delta + tabs.length) % tabs.length].id);
}

const PANE_KEYS: Record<string, VimDir> = {
  h: "h",
  j: "j",
  k: "k",
  l: "l",
};
const G_SEQUENCE_TIMEOUT_MS = 700;

/**
 * Install the app-wide vim navigation key handler. Call once, high in the tree
 * (inside the router so the workbench-route check works).
 */
export function useVimAppNav(): void {
  const vimMode = useEditorVimMode();
  const location = useLocation();

  // Refs so the single capture-phase listener never re-registers.
  const vimRef = useRef(vimMode);
  vimRef.current = vimMode;
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    let pendingG = false;
    let gTimer: ReturnType<typeof setTimeout> | undefined;
    const clearG = () => {
      pendingG = false;
      if (gTimer) {
        clearTimeout(gTimer);
        gTimer = undefined;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (!vimRef.current) return;
      const active = document.activeElement;

      // ── gt / gT: cycle workbench query tabs (workbench route only) ──
      // Recorded without preventDefault so a bare `g` still reaches pane-local
      // gg/G handlers; only the following t/T is claimed. Skipped in typing
      // fields and overlays, and inside .cm-editor (contentEditable → typing
      // context) where CodeMirror's own vim owns gt/gT.
      if (!isTypingContext(active) && !isOverlayOpen(active)) {
        if (pendingG) {
          if (e.key === "t" || e.key === "T") {
            clearG();
            if (pathRef.current === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              e.stopPropagation();
              cycleWorkbenchTab(e.key === "t" ? 1 : -1);
              return;
            }
          } else {
            clearG();
          }
        }
        if (
          e.key === "g" &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          !e.shiftKey
        ) {
          pendingG = true;
          if (gTimer) clearTimeout(gTimer);
          gTimer = setTimeout(() => {
            pendingG = false;
          }, G_SEQUENCE_TIMEOUT_MS);
          return; // don't preventDefault — let pane-local handlers see `g`
        }
      }

      // ── Ctrl+h/j/k/l: move focus between panes ──
      // Allowed from plain inputs (non-printing chords — lets you jump out of
      // the sidebar filter); blocked only inside an open overlay or a
      // CodeMirror editor in insert mode (Ctrl+h = backspace muscle memory).
      if (e.ctrlKey && !e.metaKey && !e.altKey && e.key in PANE_KEYS) {
        if (isOverlayOpen(active) || inCmInsertMode(active)) return;
        e.preventDefault();
        e.stopPropagation();
        movePane(PANE_KEYS[e.key]);
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      clearG();
    };
  }, []);
}
