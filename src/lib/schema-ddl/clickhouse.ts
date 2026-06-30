// ClickHouse DDL scaffold generators for the explorer's "edit schema" actions.
//
// Mechanism: each function returns an editable SQL string that the user reviews
// and runs in a SQL tab — deebee never auto-runs generated DDL. Destructive and
// mutating statements are emitted commented-out, so running a scaffold verbatim
// is a safe no-op; the user uncomments and edits only what they need.
//
// ponytail: scaffold-and-let-user-run instead of a structured form editor per
// object type. The same shape works for every engine, so the eventual
// postgres.ts / mysql.ts / sqlite.ts / duckdb.ts modules just swap these out.
// ClickHouse has no triggers and no foreign keys, so there is nothing to
// generate for those — that is handled in the UI, not here.

export interface ColumnRef {
  name: string;
  type: string;
}

export interface IndexRef {
  name: string;
  expr?: string;
  type?: string;
}

export interface ConstraintRef {
  name: string;
  expr?: string;
}

export type ViewKind = "view" | "materialized_view";

/** Backtick-quote an identifier, escaping embedded backticks. */
const tick = (id: string): string => `\`${id.replace(/`/g, "``")}\``;

/** `db`.`name` */
const qualified = (db: string, name: string): string =>
  `${tick(db)}.${tick(name)}`;

/**
 * Editable ALTER TABLE scaffold for column changes. All operations are
 * commented out so running the script verbatim is a safe no-op; the user
 * uncomments and edits the ones they need. Current columns are listed for
 * reference.
 */
export function buildColumnEditDDL(
  database: string,
  table: string,
  columns: ColumnRef[],
): string {
  const target = qualified(database, table);
  const lastCol = columns.length ? columns[columns.length - 1].name : "existing_column";
  const firstCol = columns.length ? columns[0].name : "existing_column";
  const currentList = columns.length
    ? columns.map((c) => `--   ${c.name}  ${c.type}`).join("\n")
    : "--   (no columns found)";
  return `-- Edit columns for ${target}
-- Uncomment and edit the operations you need, then Run.
-- ClickHouse applies these as a mutation. Columns in the primary key or sorting
-- key cannot be dropped, and their type can only be changed in limited ways.

-- ALTER TABLE ${target} ADD COLUMN IF NOT EXISTS new_column String AFTER ${tick(lastCol)};
-- ALTER TABLE ${target} MODIFY COLUMN ${tick(firstCol)} Nullable(String);
-- ALTER TABLE ${target} RENAME COLUMN ${tick(firstCol)} TO new_name;
-- ALTER TABLE ${target} COMMENT COLUMN ${tick(firstCol)} 'description';
-- ALTER TABLE ${target} DROP COLUMN existing_column;

-- Current columns:
${currentList}
`;
}

/**
 * Editable scaffold for ClickHouse data-skipping indices. Existing indices are
 * listed for reference; MATERIALIZE is included because ADD INDEX only affects
 * parts written after it.
 */
export function buildIndexEditDDL(
  database: string,
  table: string,
  indices: IndexRef[] = [],
): string {
  const target = qualified(database, table);
  const existing = indices.length
    ? indices
        .map((i) => `--   ${i.name}${i.type ? `  TYPE ${i.type}` : ""}${i.expr ? `  ON ${i.expr}` : ""}`)
        .join("\n")
    : "--   (no data-skipping indices)";
  return `-- Edit data-skipping indices for ${target}
-- Uncomment and edit the operations you need, then Run.

-- ALTER TABLE ${target} ADD INDEX index_name expression TYPE minmax GRANULARITY 1;
-- ALTER TABLE ${target} MATERIALIZE INDEX index_name;
-- ALTER TABLE ${target} DROP INDEX index_name;

-- Existing indices:
${existing}
`;
}

/**
 * Editable scaffold for ClickHouse CHECK constraints. Note: ClickHouse only
 * validates constraints on INSERT; they are not enforced retroactively.
 */
export function buildConstraintEditDDL(
  database: string,
  table: string,
  constraints: ConstraintRef[] = [],
): string {
  const target = qualified(database, table);
  const existing = constraints.length
    ? constraints
        .map((c) => `--   ${c.name}${c.expr ? `  CHECK ${c.expr}` : ""}`)
        .join("\n")
    : "--   (no constraints)";
  return `-- Edit constraints for ${target}
-- Uncomment and edit the operations you need, then Run.
-- ClickHouse checks constraints on INSERT only; existing rows are not validated.

-- ALTER TABLE ${target} ADD CONSTRAINT constraint_name CHECK expression;
-- ALTER TABLE ${target} DROP CONSTRAINT constraint_name;

-- Existing constraints:
${existing}
`;
}

/**
 * Turn a `SHOW CREATE TABLE` statement for a view into an editable, runnable
 * edit script.
 *
 * - Plain views become `CREATE OR REPLACE VIEW …` (ClickHouse supports this and
 *   it is non-destructive).
 * - Materialized views cannot be replaced in place. The scaffold shows the
 *   non-destructive `ALTER TABLE … MODIFY QUERY` path (preferred) and, commented
 *   out, the destructive DROP + recreate path using the original definition.
 */
export function buildViewEditDDL(
  database: string,
  name: string,
  showCreateStatement: string,
  kind: ViewKind,
): string {
  const target = qualified(database, name);
  const stmt = showCreateStatement.trim();

  if (kind === "view") {
    const replaced = stmt.replace(
      /^\s*CREATE\s+(OR\s+REPLACE\s+)?VIEW/i,
      "CREATE OR REPLACE VIEW",
    );
    return `-- Edit view ${target}
-- Adjust the SELECT below and Run. CREATE OR REPLACE updates the view in place.

${replaced}
`;
  }

  // materialized_view
  return `-- Edit materialized view ${target}
-- A materialized view cannot be replaced in place. Choose one path:
--
-- Option A (no data loss) — change only the SELECT the MV runs on new inserts:
--   ALTER TABLE ${target} MODIFY QUERY
--   SELECT ... FROM ... ;
--
-- Option B (rebuild) — drop and recreate. This discards the MV's stored result
-- unless it targets a separate table (TO table). Uncomment to use:
--
-- DROP TABLE IF EXISTS ${target};

-- Current definition (for reference / Option B):
${stmt
  .split("\n")
  .map((l) => `-- ${l}`)
  .join("\n")}
`;
}
