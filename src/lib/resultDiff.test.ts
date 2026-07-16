import { describe, expect, it } from "vitest";
import {
	cellEquals,
	computeResultDiff,
	diffIsEmpty,
	type RowData,
} from "./resultDiff";

const COLS = ["id", "name"];

function harness(base: RowData[]) {
	// Mimic DataTable's provenance: identity for untouched rows, explicit map
	// for edited descendants, absent for grid-created rows.
	const prov = new WeakMap<RowData, number>();
	const baseIdx = new Map(base.map((r, i) => [r, i]));
	const baseIndexOf = (row: RowData) => prov.get(row) ?? baseIdx.get(row);
	return { prov, baseIndexOf };
}

describe("cellEquals", () => {
	it("compares scalars and null", () => {
		expect(cellEquals(1, 1)).toBe(true);
		expect(cellEquals(null, null)).toBe(true);
		expect(cellEquals(1, "1")).toBe(false);
		expect(cellEquals(null, 0)).toBe(false);
	});
	it("compares objects structurally", () => {
		expect(cellEquals({ a: 1 }, { a: 1 })).toBe(true);
		expect(cellEquals([1, 2], [1, 2])).toBe(true);
		expect(cellEquals({ a: 1 }, { a: 2 })).toBe(false);
	});
});

describe("computeResultDiff", () => {
	const base: RowData[] = [
		{ id: 1, name: "a" },
		{ id: 2, name: "b" },
		{ id: 3, name: "c" },
	];

	it("pristine rows produce an empty diff (including reorders)", () => {
		const { baseIndexOf } = harness(base);
		const reordered = [base[2], base[0], base[1]];
		const d = computeResultDiff(base, reordered, COLS, baseIndexOf);
		expect(diffIsEmpty(d)).toBe(true);
	});

	it("detects updates with changed columns", () => {
		const { prov, baseIndexOf } = harness(base);
		const edited = { id: 2, name: "B!" };
		prov.set(edited, 1);
		const d = computeResultDiff(base, [base[0], edited, base[2]], COLS, baseIndexOf);
		expect(d.updates).toEqual([
			{ baseIndex: 1, base: base[1], row: edited, changedCols: ["name"] },
		]);
		expect(d.inserts).toEqual([]);
		expect(d.deletes).toEqual([]);
	});

	it("an edit reverted to the original value drops out of the diff", () => {
		const { prov, baseIndexOf } = harness(base);
		const reverted = { id: 2, name: "b" };
		prov.set(reverted, 1);
		const d = computeResultDiff(base, [base[0], reverted, base[2]], COLS, baseIndexOf);
		expect(diffIsEmpty(d)).toBe(true);
	});

	it("rows without provenance are inserts (add / duplicate)", () => {
		const { baseIndexOf } = harness(base);
		const dup = { ...base[0] };
		const d = computeResultDiff(base, [...base, dup], COLS, baseIndexOf);
		expect(d.inserts).toEqual([dup]);
		expect(d.updates).toEqual([]);
	});

	it("missing base rows are deletes", () => {
		const { baseIndexOf } = harness(base);
		const d = computeResultDiff(base, [base[0], base[2]], COLS, baseIndexOf);
		expect(d.deletes).toEqual([{ baseIndex: 1, base: base[1] }]);
	});

	it("delete + insert + update compose", () => {
		const { prov, baseIndexOf } = harness(base);
		const edited = { id: 3, name: "C!" };
		prov.set(edited, 2);
		const added = { id: 9, name: "new" };
		const d = computeResultDiff(base, [edited, base[0], added], COLS, baseIndexOf);
		expect(d.updates.map((u) => u.baseIndex)).toEqual([2]);
		expect(d.inserts).toEqual([added]);
		expect(d.deletes.map((x) => x.baseIndex)).toEqual([1]);
	});
});
