import { describe, expect, it } from "vitest";
import { coerceCellEdit, editableCellText } from "./DataTable";

describe("editableCellText", () => {
	it("renders null/undefined as empty for editing", () => {
		expect(editableCellText(null)).toBe("");
		expect(editableCellText(undefined)).toBe("");
	});
	it("stringifies objects and passes scalars through", () => {
		expect(editableCellText({ a: 1 })).toBe('{"a":1}');
		expect(editableCellText(42)).toBe("42");
		expect(editableCellText("x")).toBe("x");
	});
});

describe("coerceCellEdit", () => {
	it("keeps strings as strings", () => {
		expect(coerceCellEdit("hello", "String", "old")).toBe("hello");
	});
	it("clears Nullable cells to null on empty input", () => {
		expect(coerceCellEdit("", "Nullable(String)", "old")).toBeNull();
		expect(coerceCellEdit("", "LowCardinality(Nullable(String))", "x")).toBeNull();
	});
	it("keeps empty string for non-nullable string columns", () => {
		expect(coerceCellEdit("", "String", "old")).toBe("");
	});
	it("keeps null when the previous value was null, regardless of type", () => {
		expect(coerceCellEdit("", "String", null)).toBeNull();
	});
	it("parses numbers for numeric columns", () => {
		expect(coerceCellEdit("42", "UInt64", 1)).toBe(42);
		expect(coerceCellEdit("-1.5", "Float64", 0)).toBe(-1.5);
		expect(coerceCellEdit("3", "Nullable(Int32)", null)).toBe(3);
		expect(coerceCellEdit("9.99", "Decimal(10, 2)", "0")).toBe(9.99);
	});
	it("falls back to string when numeric input does not parse", () => {
		expect(coerceCellEdit("abc", "UInt64", 1)).toBe("abc");
	});
	it("keeps 64-bit integers as strings when Number would lose precision", () => {
		expect(coerceCellEdit("9223372036854775807", "UInt64", "1")).toBe(
			"9223372036854775807",
		);
		expect(coerceCellEdit("1.50", "Decimal(10, 2)", "0")).toBe("1.50");
		expect(coerceCellEdit("42", "UInt64", 1)).toBe(42);
	});
	it("does not coerce numeric-looking input for string columns", () => {
		expect(coerceCellEdit("42", "String", "x")).toBe("42");
	});
	it("parses JSON when the previous value was an object", () => {
		expect(coerceCellEdit('{"a":2}', "Map(String, UInt8)", { a: 1 })).toEqual({
			a: 2,
		});
		expect(coerceCellEdit("[1,2]", "Array(UInt8)", [1])).toEqual([1, 2]);
	});
	it("keeps invalid JSON as a string for object cells", () => {
		expect(coerceCellEdit("{oops", "Map(String, UInt8)", { a: 1 })).toBe(
			"{oops",
		);
	});
	it("parses JSON into null cells of complex-typed columns", () => {
		expect(coerceCellEdit('{"a":1}', "Map(String, UInt8)", null, true)).toEqual(
			{ a: 1 },
		);
		expect(coerceCellEdit("[1,2]", "Array(UInt8)", null, true)).toEqual([1, 2]);
	});
	it("does not JSON-parse scalar columns even when input looks like JSON", () => {
		expect(coerceCellEdit('{"a":1}', "String", "x")).toBe('{"a":1}');
	});
});
