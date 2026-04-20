// sqlContextParser.ts
/**
 * SQL Context Parser for Monaco Editor Autocomplete
 *
 * Provides intelligent SQL context parsing to enable:
 * - Clause-aware suggestions (SELECT, FROM, WHERE, etc.)
 * - Database and table reference extraction
 * - Alias resolution
 * - Smart column suggestions based on context
 */

/**
 * Represents a table reference in a SQL query
 */
export interface TableReference {
  database: string | null;
  table: string;
  alias?: string;
  endPosition?: number; // Position after table name where alias can be inserted
}

/**
 * SQL clause types
 */
export type ClauseType =
  | 'SELECT'
  | 'FROM'
  | 'WHERE'
  | 'PREWHERE'
  | 'GROUP_BY'
  | 'ORDER_BY'
  | 'HAVING'
  | 'JOIN'
  | 'ARRAY_JOIN'
  | 'SAMPLE'
  | 'FORMAT'
  | 'SETTINGS'
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'SET'
  | 'VALUES'
  | 'CREATE'
  | 'ALTER'
  | 'DROP'
  | 'ENGINE'
  | 'TO'
  | 'UNKNOWN';

/**
 * Token types for SQL parsing
 */
type TokenType =
  | 'KEYWORD'
  | 'IDENTIFIER'
  | 'DOT'
  | 'COMMA'
  | 'OPERATOR'
  | 'STRING'
  | 'NUMBER'
  | 'PAREN'
  | 'COMMENT'
  | 'WHITESPACE'
  | 'UNKNOWN';

/**
 * Token with position information
 */
interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}

/**
 * Complete SQL context information
 */
export interface SQLContext {
  clauseType: ClauseType;
  fromTables: TableReference[];
  currentWord: string;
  isAfterDot: boolean;
  databasePrefix?: string;
  tablePrefix?: string;
  selectedDatabase: string | null;
  isSimpleSelect: boolean; // true if SELECT without FROM/WHERE/etc.
}

/**
 * SQL keywords mapped to their clause types
 */
const CLAUSE_KEYWORDS: Record<string, ClauseType> = {
  SELECT: 'SELECT',
  FROM: 'FROM',
  WHERE: 'WHERE',
  PREWHERE: 'PREWHERE',
  'GROUP BY': 'GROUP_BY',
  GROUPBY: 'GROUP_BY',
  'ORDER BY': 'ORDER_BY',
  ORDERBY: 'ORDER_BY',
  HAVING: 'HAVING',
  JOIN: 'JOIN',
  'INNER JOIN': 'JOIN',
  'LEFT JOIN': 'JOIN',
  'RIGHT JOIN': 'JOIN',
  'FULL JOIN': 'JOIN',
  'CROSS JOIN': 'JOIN',
  'ARRAY JOIN': 'ARRAY_JOIN',
  SAMPLE: 'SAMPLE',
  FORMAT: 'FORMAT',
  SETTINGS: 'SETTINGS',
  INSERT: 'INSERT',
  'INSERT INTO': 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  SET: 'SET',
  VALUES: 'VALUES',
  CREATE: 'CREATE',
  ALTER: 'ALTER',
  DROP: 'DROP',
  ENGINE: 'ENGINE',
  TO: 'TO',
};

/**
 * Keywords that indicate the start of a new clause
 */
const CLAUSE_BOUNDARY_KEYWORDS = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'PREWHERE',
  'GROUP',
  'ORDER',
  'BY',  // Enables GROUP BY / ORDER BY detection
  'HAVING',
  'JOIN',
  'INNER',
  'LEFT',
  'RIGHT',
  'FULL',
  'CROSS',
  'ARRAY',
  'SAMPLE',
  'FORMAT',
  'SETTINGS',
  'LIMIT',
  'OFFSET',
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'SET',
  'VALUES',
  // DDL keywords
  'CREATE',
  'ALTER',
  'DROP',
  'TABLE',
  'VIEW',
  'MATERIALIZED',
  'DATABASE',
  'ENGINE',
  'TO',
  'AS',
  'IF',
  'EXISTS',
  'PARTITION',
]);

/**
 * Simple SQL tokenizer
 */
function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < query.length) {
    const char = query[i];

    // Whitespace
    if (/\s/.test(char)) {
      const start = i;
      while (i < query.length && /\s/.test(query[i])) i++;
      tokens.push({
        type: 'WHITESPACE',
        value: query.slice(start, i),
        start,
        end: i,
      });
      continue;
    }

    // Single-line comment (-- comment)
    if (char === '-' && query[i + 1] === '-') {
      const start = i;
      while (i < query.length && query[i] !== '\n') i++;
      tokens.push({
        type: 'COMMENT',
        value: query.slice(start, i),
        start,
        end: i,
      });
      continue;
    }

    // Multi-line comment (/* comment */)
    if (char === '/' && query[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < query.length - 1 && !(query[i] === '*' && query[i + 1] === '/')) {
        i++;
      }
      i += 2; // Skip */
      tokens.push({
        type: 'COMMENT',
        value: query.slice(start, i),
        start,
        end: i,
      });
      continue;
    }

    // String literal (single or double quotes)
    if (char === "'" || char === '"') {
      const quote = char;
      const start = i;
      i++; // Skip opening quote
      while (i < query.length && query[i] !== quote) {
        if (query[i] === '\\') i++; // Skip escaped character
        i++;
      }
      i++; // Skip closing quote
      tokens.push({
        type: 'STRING',
        value: query.slice(start, i),
        start,
        end: i,
      });
      continue;
    }

    // Backtick identifier
    if (char === '`') {
      const start = i;
      i++; // Skip opening backtick
      while (i < query.length && query[i] !== '`') {
        if (query[i] === '\\') i++; // Skip escaped character
        i++;
      }
      i++; // Skip closing backtick
      tokens.push({
        type: 'IDENTIFIER',
        value: query.slice(start + 1, i - 1), // Remove backticks
        start,
        end: i,
      });
      continue;
    }

    // Number
    if (/\d/.test(char)) {
      const start = i;
      while (i < query.length && /[\d.]/.test(query[i])) i++;
      tokens.push({
        type: 'NUMBER',
        value: query.slice(start, i),
        start,
        end: i,
      });
      continue;
    }

    // Dot
    if (char === '.') {
      tokens.push({
        type: 'DOT',
        value: '.',
        start: i,
        end: i + 1,
      });
      i++;
      continue;
    }

    // Comma
    if (char === ',') {
      tokens.push({
        type: 'COMMA',
        value: ',',
        start: i,
        end: i + 1,
      });
      i++;
      continue;
    }

    // Parentheses
    if (char === '(' || char === ')') {
      tokens.push({
        type: 'PAREN',
        value: char,
        start: i,
        end: i + 1,
      });
      i++;
      continue;
    }

    // Operators
    if (/[=<>!+\-*/%]/.test(char)) {
      const start = i;
      while (i < query.length && /[=<>!+\-*/%]/.test(query[i])) i++;
      tokens.push({
        type: 'OPERATOR',
        value: query.slice(start, i),
        start,
        end: i,
      });
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(char)) {
      const start = i;
      while (i < query.length && /[a-zA-Z0-9_]/.test(query[i])) i++;
      const value = query.slice(start, i);
      const upperValue = value.toUpperCase();

      tokens.push({
        type: CLAUSE_BOUNDARY_KEYWORDS.has(upperValue) ? 'KEYWORD' : 'IDENTIFIER',
        value,
        start,
        end: i,
      });
      continue;
    }

    // Unknown character
    tokens.push({
      type: 'UNKNOWN',
      value: char,
      start: i,
      end: i + 1,
    });
    i++;
  }

  return tokens;
}

/**
 * Determine the SQL clause type at the cursor position
 */
function determineClauseType(tokens: Token[], cursorTokenIndex: number): ClauseType {
  // Walk backwards from cursor to find the last clause keyword
  for (let i = cursorTokenIndex; i >= 0; i--) {
    const token = tokens[i];
    if (token.type === 'KEYWORD') {
      const keyword = token.value.toUpperCase();

      // Check for multi-word keywords like "GROUP BY", "ORDER BY"
      if (keyword === 'BY') {
        // Find the previous non-whitespace token
        let prevIndex = i - 1;
        while (prevIndex >= 0 && tokens[prevIndex].type === 'WHITESPACE') {
          prevIndex--;
        }
        if (prevIndex >= 0 && tokens[prevIndex].type === 'KEYWORD') {
          const prevKeyword = tokens[prevIndex].value.toUpperCase();
          if (prevKeyword === 'GROUP') return 'GROUP_BY';
          if (prevKeyword === 'ORDER') return 'ORDER_BY';
        }
      }

      // Check for single keywords
      if (CLAUSE_KEYWORDS[keyword]) {
        return CLAUSE_KEYWORDS[keyword];
      }
    }
  }

  return 'UNKNOWN';
}

/**
 * Extract table references from FROM and JOIN clauses
 */
function extractTableReferences(tokens: Token[]): TableReference[] {
  const tables: TableReference[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    // Skip whitespace and comments
    if (token.type === 'WHITESPACE' || token.type === 'COMMENT') {
      i++;
      continue;
    }

    // Look for FROM or JOIN keywords
    if (token.type === 'KEYWORD') {
      const keyword = token.value.toUpperCase();
      if (
        keyword === 'FROM' ||
        keyword === 'JOIN' ||
        keyword.endsWith(' JOIN')
      ) {
        i++;

        // Skip whitespace
        while (i < tokens.length && tokens[i].type === 'WHITESPACE') i++;

        if (i >= tokens.length) break;

        // Parse table reference (database.table or just table)
        let database: string | null = null;
        let table: string = '';
        let alias: string | undefined;
        let endPosition: number | undefined;

        // First identifier or keyword (could be database or table)
        if (tokens[i].type === 'IDENTIFIER' || tokens[i].type === 'KEYWORD') {
          const firstPart = tokens[i].value;
          let tableEndIndex = i; // Track the index of the table name token
          i++;

          // Check if there's a dot (database.table)
          if (i < tokens.length && tokens[i].type === 'DOT') {
            database = firstPart;
            i++; // Skip dot

            // Get table name
            if (i < tokens.length && (tokens[i].type === 'IDENTIFIER' || tokens[i].type === 'KEYWORD')) {
              table = tokens[i].value;
              tableEndIndex = i;
              i++;
            }
          } else {
            // No dot, so it's just a table name
            table = firstPart;
          }

          // Capture end position of the table name token (where alias would be inserted)
          endPosition = tokens[tableEndIndex].end;

          // Check for alias (AS keyword is optional)
          while (i < tokens.length && tokens[i].type === 'WHITESPACE') i++;

          if (i < tokens.length) {
            if (tokens[i].type === 'KEYWORD' && tokens[i].value.toUpperCase() === 'AS') {
              i++; // Skip AS
              while (i < tokens.length && tokens[i].type === 'WHITESPACE') i++;
            }

            // Get alias if present
            if (
              i < tokens.length &&
              (tokens[i].type === 'IDENTIFIER' || tokens[i].type === 'KEYWORD') &&
              !CLAUSE_BOUNDARY_KEYWORDS.has(tokens[i].value.toUpperCase())
            ) {
              alias = tokens[i].value;
              i++;
            }
          }

          if (table) {
            tables.push({ database, table, alias, endPosition });
          }
        }
      }
    }

    i++;
  }

  return tables;
}

/**
 * Parse SQL query to extract context information
 */
export function parseSQLContext(
  query: string,
  cursorOffset: number,
  selectedDatabase: string | null
): SQLContext {
  const tokens = tokenize(query);

  // Find the token at the cursor position
  let cursorTokenIndex = -1;
  let currentWord = '';
  let isAfterDot = false;
  let databasePrefix: string | undefined;
  let tablePrefix: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (cursorOffset >= token.start && cursorOffset <= token.end) {
      cursorTokenIndex = i;
      if (token.type === 'IDENTIFIER' || token.type === 'KEYWORD') {
        currentWord = token.value.slice(0, cursorOffset - token.start);
      }
      break;
    }
  }

  // If cursor is not in a token, find the previous non-whitespace token
  if (cursorTokenIndex === -1) {
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (tokens[i].end <= cursorOffset) {
        cursorTokenIndex = i;
        break;
      }
    }
  }

  // Check if cursor is after a dot (for database.table or table.column completion)
  if (cursorTokenIndex >= 0) {
    // Look backwards for dot and identifiers
    let i = cursorTokenIndex;

    // Skip current word if we're in the middle of typing
    if (tokens[i]?.type === 'IDENTIFIER' || tokens[i]?.type === 'KEYWORD') {
      currentWord = tokens[i].value;
    }

    // Case 1: cursor is after an identifier that follows a dot (e.g. "db.Pa|")
    if (i > 0 && tokens[i - 1].type === 'DOT') {
      isAfterDot = true;

      // Get the identifier before the dot
      if (i > 1 && (tokens[i - 2].type === 'IDENTIFIER' || tokens[i - 2].type === 'KEYWORD')) {
        const beforeDot = tokens[i - 2].value;

        // Check if there's another dot before (database.table.column pattern)
        if (i > 3 && tokens[i - 3].type === 'DOT' && (tokens[i - 4].type === 'IDENTIFIER' || tokens[i - 4].type === 'KEYWORD')) {
          databasePrefix = tokens[i - 4].value;
          tablePrefix = beforeDot;
        } else {
          // Just one dot (database.table or table.column)
          databasePrefix = beforeDot;
        }
      }
    // Case 2: cursor is ON the dot itself with nothing typed after (e.g. "db.|")
    } else if (tokens[i]?.type === 'DOT') {
      isAfterDot = true;
      if (i > 0 && (tokens[i - 1].type === 'IDENTIFIER' || tokens[i - 1].type === 'KEYWORD')) {
        const beforeDot = tokens[i - 1].value;
        if (i > 2 && tokens[i - 2].type === 'DOT' && (tokens[i - 3].type === 'IDENTIFIER' || tokens[i - 3].type === 'KEYWORD')) {
          databasePrefix = tokens[i - 3].value;
          tablePrefix = beforeDot;
        } else {
          databasePrefix = beforeDot;
        }
      }
    }
  }

  // Determine clause type
  const clauseType = determineClauseType(tokens, cursorTokenIndex);

  // Extract table references from FROM and JOIN clauses
  const fromTables = extractTableReferences(tokens);

  // Detect if this is a simple SELECT without other clauses
  const hasOtherClauses = tokens.some(
    (token) =>
      token.type === 'KEYWORD' &&
      ['FROM', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'JOIN'].includes(
        token.value.toUpperCase()
      )
  );
  const isSimpleSelect = clauseType === 'SELECT' && !hasOtherClauses;

  return {
    clauseType,
    fromTables,
    currentWord,
    isAfterDot,
    databasePrefix,
    tablePrefix,
    selectedDatabase,
    isSimpleSelect,
  };
}

/**
 * Generate a unique table alias based on the table name
 * Strategy:
 * 1. Use first letter lowercase (users -> u)
 * 2. If conflict, use first two letters (users -> us)
 * 3. If still conflict, append number (u1, u2, etc.)
 */
export function generateTableAlias(
  tableName: string,
  existingAliases: Set<string>
): string {
  if (!tableName) return 't';

  // Try first letter (lowercase)
  const firstLetter = tableName[0].toLowerCase();
  if (!existingAliases.has(firstLetter)) {
    return firstLetter;
  }

  // Try first two letters
  if (tableName.length >= 2) {
    const firstTwo = tableName.slice(0, 2).toLowerCase();
    if (!existingAliases.has(firstTwo)) {
      return firstTwo;
    }
  }

  // Append number to first letter
  let counter = 1;
  let candidate = `${firstLetter}${counter}`;
  while (existingAliases.has(candidate)) {
    counter++;
    candidate = `${firstLetter}${counter}`;
  }

  return candidate;
}
