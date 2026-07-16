/**
 * Diff between a query result (base rows) and the grid's staged scratchpad
 * (local rows). Row provenance is supplied by the caller: `baseIndexOf(row)`
 * returns the base-row index a local row descends from, or undefined for
 * rows created in the grid (inserts / duplicates).
 *
 * Reordering rows changes neither provenance nor values, so it never shows
 * up in the diff — row order has no meaning to the database.
 */

export type RowData = Record<string, unknown>;

export interface RowUpdate {
	baseIndex: number;
	base: RowData;
	row: RowData;
	changedCols: string[];
}

export interface ResultDiff {
	updates: RowUpdate[];
	inserts: RowData[];
	deletes: { baseIndex: number; base: RowData }[];
}

/** Value equality for grid cells: scalars by Object.is, objects by JSON. */
export function cellEquals(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (
		typeof a === "object" &&
		a !== null &&
		typeof b === "object" &&
		b !== null
	) {
		try {
			return JSON.stringify(a) === JSON.stringify(b);
		} catch {
			return false;
		}
	}
	return false;
}

export function computeResultDiff(
	baseRows: RowData[],
	localRows: RowData[],
	columns: string[],
	baseIndexOf: (row: RowData) => number | undefined,
): ResultDiff {
	const updates: RowUpdate[] = [];
	const inserts: RowData[] = [];
	const seenBase = new Set<number>();

	for (const row of localRows) {
		const bi = baseIndexOf(row);
		if (bi === undefined || baseRows[bi] === undefined) {
			inserts.push(row);
			continue;
		}
		seenBase.add(bi);
		const base = baseRows[bi];
		const changedCols = columns.filter((c) => !cellEquals(base[c], row[c]));
		if (changedCols.length) updates.push({ baseIndex: bi, base, row, changedCols });
	}

	const deletes = baseRows.flatMap((base, baseIndex) =>
		seenBase.has(baseIndex) ? [] : [{ baseIndex, base }],
	);

	return { updates, inserts, deletes };
}

export function diffIsEmpty(d: ResultDiff): boolean {
	return !d.updates.length && !d.inserts.length && !d.deletes.length;
}
