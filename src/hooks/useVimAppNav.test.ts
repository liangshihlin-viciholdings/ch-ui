import { describe, it, expect } from "vitest";
import { resolvePaneInDirection, type PaneBox } from "./useVimAppNav";

// Workbench layout: full-height sidebar on the left; editor over results on the
// right (a vertical split). Plus `main` = the whole right column, used on
// single-pane routes.
const sidebar: PaneBox = { left: 0, top: 0, right: 288, bottom: 800 };
const editor: PaneBox = { left: 288, top: 40, right: 1200, bottom: 420 };
const results: PaneBox = { left: 288, top: 420, right: 1200, bottom: 800 };
const main: PaneBox = { left: 288, top: 0, right: 1200, bottom: 800 };

const wrap = (boxes: PaneBox[]) => boxes.map((rect) => ({ rect }));

describe("resolvePaneInDirection — workbench", () => {
  it("editor → results on Ctrl+j, and clamps (no pane above) on Ctrl+k", () => {
    expect(resolvePaneInDirection(editor, wrap([sidebar, results]), "j")?.rect).toBe(results);
    expect(resolvePaneInDirection(editor, wrap([sidebar, results]), "k")).toBeNull();
  });

  it("results → editor on Ctrl+k, and clamps (no pane below) on Ctrl+j", () => {
    expect(resolvePaneInDirection(results, wrap([sidebar, editor]), "k")?.rect).toBe(editor);
    expect(resolvePaneInDirection(results, wrap([sidebar, editor]), "j")).toBeNull();
  });

  it("editor/results → sidebar on Ctrl+h, and clamp (nothing further right) on Ctrl+l", () => {
    expect(resolvePaneInDirection(editor, wrap([sidebar, results]), "h")?.rect).toBe(sidebar);
    expect(resolvePaneInDirection(results, wrap([sidebar, editor]), "h")?.rect).toBe(sidebar);
    expect(resolvePaneInDirection(editor, wrap([sidebar, results]), "l")).toBeNull();
  });

  it("sidebar → editor on Ctrl+l (nearest by vertical center), no-op on Ctrl+h/j/k", () => {
    // editor's center is closer to the sidebar's vertical center than results'.
    expect(resolvePaneInDirection(sidebar, wrap([editor, results]), "l")?.rect).toBe(editor);
    expect(resolvePaneInDirection(sidebar, wrap([editor, results]), "h")).toBeNull();
    // sidebar and the right column are adjacent (not overlapping) horizontally,
    // so Ctrl+j/k from the sidebar find nothing.
    expect(resolvePaneInDirection(sidebar, wrap([editor, results]), "j")).toBeNull();
    expect(resolvePaneInDirection(sidebar, wrap([editor, results]), "k")).toBeNull();
  });
});

describe("resolvePaneInDirection — single-pane route", () => {
  it("main ⇄ sidebar only, with j/k no-ops", () => {
    expect(resolvePaneInDirection(main, wrap([sidebar]), "h")?.rect).toBe(sidebar);
    expect(resolvePaneInDirection(main, wrap([sidebar]), "l")).toBeNull();
    expect(resolvePaneInDirection(sidebar, wrap([main]), "l")?.rect).toBe(main);
    expect(resolvePaneInDirection(main, wrap([sidebar]), "j")).toBeNull();
    expect(resolvePaneInDirection(main, wrap([sidebar]), "k")).toBeNull();
  });
});
