export type ScalarType = { kind: "Scalar"; raw: string };
export type NullableType = { kind: "Nullable"; inner: ColumnTypeAst };
export type LowCardinalityType = { kind: "LowCardinality"; inner: ColumnTypeAst };
export type ArrayType = { kind: "Array"; element: ColumnTypeAst };
export type MapType = { kind: "Map"; key: ColumnTypeAst; value: ColumnTypeAst };
export type TupleField = { name: string | null; type: ColumnTypeAst };
export type TupleType = { kind: "Tuple"; fields: TupleField[] };
export type NestedType = { kind: "Nested"; fields: Array<{ name: string; type: ColumnTypeAst }> };
export type JsonType = { kind: "Json" };
export type UnknownType = { kind: "Unknown"; raw: string };

export type ColumnTypeAst =
  | ScalarType
  | NullableType
  | LowCardinalityType
  | ArrayType
  | MapType
  | TupleType
  | NestedType
  | JsonType
  | UnknownType;

// ---------------------------------------------------------------------------
// Recursive descent parser
// ---------------------------------------------------------------------------

function skipWs(src: string, pos: number): number {
  while (pos < src.length && src[pos] === " ") pos++;
  return pos;
}

function readIdent(src: string, pos: number): [string, number] {
  const start = pos;
  // Quoted identifier: `foo bar`
  if (src[pos] === "`") {
    pos++;
    while (pos < src.length && src[pos] !== "`") pos++;
    return [src.slice(start + 1, pos), pos + 1];
  }
  // Unquoted: alphanumeric + _ + . + ' (for Enum values and DateTime('UTC'))
  while (pos < src.length && /[A-Za-z0-9_.']/.test(src[pos])) pos++;
  return [src.slice(start, pos), pos];
}

function parseList(src: string, pos: number): [string[], number] {
  // Parse comma-separated top-level tokens, respecting balanced parens.
  const items: string[] = [];
  let depth = 0;
  let start = pos;
  while (pos < src.length) {
    const ch = src[pos];
    if (ch === "(") depth++;
    else if (ch === ")") {
      if (depth === 0) break;
      depth--;
    } else if (ch === "," && depth === 0) {
      items.push(src.slice(start, pos).trim());
      start = pos + 1;
    }
    pos++;
  }
  const last = src.slice(start, pos).trim();
  if (last) items.push(last);
  return [items, pos];
}

function parseType(raw: string): ColumnTypeAst {
  const s = raw.trim();
  const parenIdx = s.indexOf("(");

  if (parenIdx === -1) {
    // No params — plain scalar
    const upper = s.toUpperCase();
    if (upper === "JSON") return { kind: "Json" };
    return { kind: "Scalar", raw: s };
  }

  const name = s.slice(0, parenIdx).trim();
  const inner = s.slice(parenIdx + 1, s.lastIndexOf(")")).trim();
  const upper = name.toUpperCase();

  if (upper === "NULLABLE") return { kind: "Nullable", inner: parseType(inner) };
  if (upper === "LOWCARDINALITY") return { kind: "LowCardinality", inner: parseType(inner) };
  if (upper === "ARRAY") return { kind: "Array", element: parseType(inner) };
  if (upper === "JSON" || upper === "OBJECT") return { kind: "Json" };

  if (upper === "MAP") {
    const [items] = parseList(inner, 0);
    if (items.length === 2) {
      return { kind: "Map", key: parseType(items[0]), value: parseType(items[1]) };
    }
    return { kind: "Unknown", raw: s };
  }

  if (upper === "TUPLE") {
    const [items] = parseList(inner, 0);
    const fields: TupleField[] = items.map((item) => {
      // Named field: "name Type(…)" — name is first token before a space that is followed
      // by an uppercase letter or a known type keyword.
      const spaceIdx = item.search(/\s+/);
      if (spaceIdx !== -1) {
        const candidate = item.slice(0, spaceIdx);
        const rest = item.slice(spaceIdx).trim();
        // Heuristic: if rest starts with uppercase it's a type name
        if (/^[A-Z]/.test(rest)) {
          return { name: candidate, type: parseType(rest) };
        }
      }
      return { name: null, type: parseType(item) };
    });
    return { kind: "Tuple", fields };
  }

  if (upper === "NESTED") {
    const [items] = parseList(inner, 0);
    const fields = items.map((item) => {
      const spaceIdx = item.search(/\s+/);
      if (spaceIdx !== -1) {
        return { name: item.slice(0, spaceIdx), type: parseType(item.slice(spaceIdx).trim()) };
      }
      return { name: item, type: { kind: "Unknown", raw: item } as ColumnTypeAst };
    });
    return { kind: "Nested", fields };
  }

  // Scalar with params (Decimal(18,4), Enum8(…), FixedString(N), DateTime('UTC'))
  const scalars = /^(DECIMAL|ENUM\d*|FIXEDSTRING|DATETIME64?|DATETIME)/i;
  if (scalars.test(name)) return { kind: "Scalar", raw: s };

  return { kind: "Unknown", raw: s };
}

const _cache = new Map<string, ColumnTypeAst>();

export function parseClickHouseType(raw: string): ColumnTypeAst {
  if (_cache.has(raw)) return _cache.get(raw)!;
  const ast = parseType(raw);
  _cache.set(raw, ast);
  return ast;
}

export function isComplexType(ast: ColumnTypeAst): boolean {
  switch (ast.kind) {
    case "Array":
    case "Map":
    case "Tuple":
    case "Nested":
    case "Json":
      return true;
    case "Nullable":
    case "LowCardinality":
      return isComplexType(ast.inner);
    case "Unknown":
      return ast.raw.includes("(");
    default:
      return false;
  }
}

export function unwrapNullable(ast: ColumnTypeAst): ColumnTypeAst {
  if (ast.kind === "Nullable" || ast.kind === "LowCardinality") return unwrapNullable(ast.inner);
  return ast;
}
