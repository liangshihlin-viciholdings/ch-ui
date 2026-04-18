// codeMirrorConfig.ts
// Central extension builder for the ClickHouse SQL editor. Composes:
//   - @codemirror/lang-sql with a custom ClickHouse dialect derived from the
//     sql-formatter tokenizer (keywords, data types, built-in functions).
//   - @codemirror/autocomplete driving ClickHouse-aware completions.
//   - A keymap for run / run-all / save shortcuts + Tab-accept-completion.
//   - Optional vim-mode extension (placed FIRST per @replit/codemirror-vim docs).
//
// The builder accepts callbacks so the SqlEditor component can wire its
// own state without coupling this module to React.

import {
  sql,
  SQLDialect,
  type SQLConfig,
} from "@codemirror/lang-sql";
import {
  autocompletion,
  acceptCompletion,
} from "@codemirror/autocomplete";
import { keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { clickhouse as clickhouseFormatter } from "sql-formatter";

import { clickhouseCompletionSource } from "./completionSource";
import { vimExtension } from "./vimMode";

// ─── ClickHouse dialect for @codemirror/lang-sql ───────────────────────────

const tokenizerOptions = clickhouseFormatter.tokenizerOptions;

const CLICKHOUSE_KEYWORDS = [
  ...tokenizerOptions.reservedKeywords,
  ...tokenizerOptions.reservedClauses,
  ...tokenizerOptions.reservedSelect,
  ...tokenizerOptions.reservedSetOperations,
  ...tokenizerOptions.reservedJoins,
  ...(tokenizerOptions.reservedKeywordPhrases ?? []),
].join(" ").toLowerCase();

const CLICKHOUSE_TYPES = (tokenizerOptions.reservedDataTypes ?? [])
  .join(" ")
  .toLowerCase();

const CLICKHOUSE_BUILTINS = (tokenizerOptions.reservedFunctionNames ?? [])
  .join(" ")
  .toLowerCase();

export const clickhouseDialect = SQLDialect.define({
  keywords: CLICKHOUSE_KEYWORDS,
  types: CLICKHOUSE_TYPES,
  builtin: CLICKHOUSE_BUILTINS,
  backslashEscapes: true,
  doubleDollarQuotedStrings: true,
  operatorChars: "*+-%<>!=&|~^/?:",
  identifierQuotes: '`"',
});

/**
 * Helper mirroring HyperDX's `clickhouseSql()` — passes the ClickHouse
 * dialect to @codemirror/lang-sql and defaults to uppercase keyword
 * rendering.
 */
export function clickhouseSql(config?: Omit<SQLConfig, "dialect">): Extension {
  return sql({
    upperCaseKeywords: true,
    ...config,
    dialect: clickhouseDialect,
  });
}

// ─── Extension builder ─────────────────────────────────────────────────────

export interface SqlExtensionOptions {
  vimMode: boolean;
  onRun: () => void;
  onRunAll: () => void;
  onSave: () => void;
}

/**
 * Build the extension array for the SQL editor. Callers should recompute
 * this whenever a dependency (theme, vimMode, callback identity) changes
 * and pass it to @uiw/react-codemirror's `extensions` prop.
 */
export function createSqlExtensions(
  options: SqlExtensionOptions,
): Extension[] {
  const extensions: Extension[] = [];

  // Vim extension MUST come before other keymaps per @replit/codemirror-vim
  // documentation. It intercepts DOM keydown events and needs priority.
  if (options.vimMode) {
    extensions.push(vimExtension());
  }

  extensions.push(
    clickhouseSql(),
    autocompletion({
      override: [clickhouseCompletionSource],
      activateOnTyping: true,
      maxRenderedOptions: 30,
    }),
    keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          options.onRun();
          return true;
        },
      },
      {
        key: "Shift-Mod-Enter",
        run: () => {
          options.onRunAll();
          return true;
        },
      },
      {
        key: "Mod-s",
        run: () => {
          options.onSave();
          return true;
        },
      },
      {
        key: "Tab",
        run: acceptCompletion,
      },
    ]),
  );

  return extensions;
}
