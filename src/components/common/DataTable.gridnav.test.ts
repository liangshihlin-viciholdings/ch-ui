import { describe, it, expect } from "vitest";
import { resolveGridTarget } from "./DataTable";

// A 3-row × 2-col grid. curRow/curCol = -1 means "nothing selected yet".
const R = 3;
const C = 2;

describe("resolveGridTarget", () => {
  it("first move from no selection lands on the origin", () => {
    expect(resolveGridTarget(-1, -1, "j", R, C)).toEqual({ row: 0, col: 0 });
    expect(resolveGridTarget(-1, -1, "l", R, C)).toEqual({ row: 0, col: 0 });
    expect(resolveGridTarget(-1, -1, "k", R, C)).toEqual({ row: 0, col: 0 });
  });

  it("j/k move rows and clamp at the edges", () => {
    expect(resolveGridTarget(0, 0, "j", R, C)).toEqual({ row: 1, col: 0 });
    expect(resolveGridTarget(2, 0, "j", R, C)).toEqual({ row: 2, col: 0 }); // clamp bottom
    expect(resolveGridTarget(1, 0, "k", R, C)).toEqual({ row: 0, col: 0 });
    expect(resolveGridTarget(0, 0, "k", R, C)).toEqual({ row: 0, col: 0 }); // clamp top
  });

  it("h/l move columns and clamp at the edges", () => {
    expect(resolveGridTarget(0, 0, "l", R, C)).toEqual({ row: 0, col: 1 });
    expect(resolveGridTarget(0, 1, "l", R, C)).toEqual({ row: 0, col: 1 }); // clamp right
    expect(resolveGridTarget(0, 1, "h", R, C)).toEqual({ row: 0, col: 0 });
    expect(resolveGridTarget(0, 0, "h", R, C)).toEqual({ row: 0, col: 0 }); // clamp left
  });

  it("gg/G jump to first/last row, keeping the column", () => {
    expect(resolveGridTarget(1, 1, "gg", R, C)).toEqual({ row: 0, col: 1 });
    expect(resolveGridTarget(1, 1, "G", R, C)).toEqual({ row: 2, col: 1 });
    // G with no selection → last row, column 0
    expect(resolveGridTarget(-1, -1, "G", R, C)).toEqual({ row: 2, col: 0 });
  });

  it("returns null for an empty grid", () => {
    expect(resolveGridTarget(-1, -1, "j", 0, C)).toBeNull();
    expect(resolveGridTarget(-1, -1, "j", R, 0)).toBeNull();
  });
});
