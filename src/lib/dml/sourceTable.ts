/**
 * Conservative single-table SELECT detection for the save-to-database flow.
 * We only ever generate DML when the result rows demonstrably map onto rows
 * of one physical table — anything else (joins, aggregates, subqueries,
 * aliases) is rejected and the grid stays a local scratchpad.
 */

export interface SourceTable {
	database: string | null;
	table: string;
}

export type SourceTableResult =
	| { ok: SourceTable }
	| { ok?: undefined; error: string };

/**
 * Blank out string literals and comments so keyword scanning can't be fooled
 * by their contents. Quotes are kept so identifiers still parse. Handles
 * Postgres dollar-quoting ($$…$$ / $tag$…$tag$). `unterminated` is set when
 * a string never closes — callers must treat that as unparseable, otherwise
 * the swallowed tail could hide JOIN/subquery clauses from keyword scans.
 */
export function stripStringsAndComments(sql: string): {
	text: string;
	unterminated: boolean;
} {
	let out = "";
	let i = 0;
	let unterminated = false;
	const n = sql.length;
	while (i < n) {
		const c = sql[i];
		const next = sql[i + 1];
		if (c === "-" && next === "-") {
			while (i < n && sql[i] !== "\n") i++;
			out += " ";
		} else if (c === "/" && next === "*") {
			i += 2;
			while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
			i += 2;
			out += " ";
		} else if (c === "$") {
			// Dollar-quoted string ($$…$$ or $tag$…$tag$). Not valid syntax on
			// every engine, but treating it as a string everywhere only ever
			// makes the check stricter.
			const m = /^\$[A-Za-z_]?[A-Za-z0-9_]*\$/.exec(sql.slice(i));
			if (m) {
				const tag = m[0];
				const end = sql.indexOf(tag, i + tag.length);
				if (end === -1) {
					unterminated = true;
					i = n;
				} else {
					out += "''";
					i = end + tag.length;
				}
			} else {
				out += c;
				i++;
			}
		} else if (c === "'" || c === '"' || c === "`") {
			// '…' string literals are blanked so their contents can't trip the
			// keyword scan; `…` / "…" quoted identifiers keep their content so
			// the table name survives extraction.
			const quote = c;
			const keep = quote !== "'";
			let closed = false;
			out += quote;
			i++;
			while (i < n) {
				if (sql[i] === "\\" && quote === "'") {
					i += 2;
					continue;
				}
				if (sql[i] === quote) {
					// Doubled quote = escaped quote inside the literal.
					if (sql[i + 1] === quote) {
						if (keep) out += quote + quote;
						i += 2;
						continue;
					}
					closed = true;
					break;
				}
				if (keep) out += sql[i];
				i++;
			}
			if (!closed) unterminated = true;
			out += quote;
			i++;
		} else {
			out += c;
			i++;
		}
	}
	return { text: out, unterminated };
}

// \` is an identity escape in regex (matches a literal backtick) and keeps
// the template literal parseable.
const IDENT = String.raw`(?:\`[^\`]+\`|"[^"]+"|[A-Za-z_][\w$]*)`;
const FROM_RE = new RegExp(
	String.raw`\bFROM\s+(${IDENT}(?:\.${IDENT})?)\s*([\s\S]*)$`,
	"i",
);
// Clauses that may legally follow the table name in a saveable SELECT.
const TAIL_RE =
	/^(FINAL\b|WHERE\b|PREWHERE\b|ORDER\s+BY\b|LIMIT\b|OFFSET\b|SETTINGS\b|FORMAT\b)/i;

function unquoteIdent(raw: string): string {
	const c = raw[0];
	if ((c === "`" || c === '"') && raw[raw.length - 1] === c) {
		return raw.slice(1, -1);
	}
	return raw;
}

const BARE_COLUMN_RE = new RegExp(`^${IDENT}$`);

export function extractSourceTable(sql: string): SourceTableResult {
	const stripped = stripStringsAndComments(sql);
	if (stripped.unterminated) {
		return {
			error: "Unterminated string literal — cannot safely parse the query.",
		};
	}
	const cleaned = stripped.text.trim().replace(/;\s*$/, "");
	if (!/^SELECT\b/i.test(cleaned)) {
		return { error: "Only SELECT results can be saved back." };
	}
	const forbidden = cleaned.match(
		/\b(JOIN|GROUP\s+BY|HAVING|UNION|INTERSECT|EXCEPT|DISTINCT|WINDOW|QUALIFY|LIMIT\s+\d+\s+BY)\b/i,
	);
	if (forbidden) {
		return {
			error: `Not a simple single-table SELECT (found ${forbidden[1].toUpperCase().replace(/\s+/g, " ")}).`,
		};
	}
	if (/\(\s*SELECT\b/i.test(cleaned)) {
		return { error: "Subqueries are not supported for saving." };
	}
	const m = FROM_RE.exec(cleaned);
	if (!m) {
		return { error: "Could not identify the source table (FROM …)." };
	}
	// The SELECT list must be `*` or bare column names: an expression, alias
	// or aggregate whose alias collides with a real column would otherwise
	// write transformed display values back over the physical column.
	const selectList = cleaned.slice("SELECT".length, m.index).trim();
	if (selectList !== "*") {
		for (const item of selectList.split(",").map((s) => s.trim())) {
			if (!BARE_COLUMN_RE.test(item)) {
				return {
					error: `SELECT list must be plain columns to save (found "${
						item.length > 40 ? `${item.slice(0, 40)}…` : item
					}") — expressions, aliases and aggregates cannot be written back.`,
				};
			}
		}
	}
	const tail = m[2].trim();
	if (tail && !TAIL_RE.test(tail)) {
		return {
			error:
				"Clauses after the table name (alias, comma join, …) prevent saving.",
		};
	}
	const parts = m[1].split(".");
	// A quoted ident can contain a dot; re-split conservatively.
	if (parts.length > 2 || m[1].includes("`.`") || m[1].includes('"."')) {
		const qm = new RegExp(String.raw`^(${IDENT})\.(${IDENT})$`).exec(m[1]);
		if (qm) {
			return {
				ok: { database: unquoteIdent(qm[1]), table: unquoteIdent(qm[2]) },
			};
		}
	}
	if (parts.length === 2) {
		return {
			ok: { database: unquoteIdent(parts[0]), table: unquoteIdent(parts[1]) },
		};
	}
	return { ok: { database: null, table: unquoteIdent(m[1]) } };
}
