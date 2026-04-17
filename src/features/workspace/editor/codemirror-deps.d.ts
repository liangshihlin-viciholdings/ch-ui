// codemirror-deps.d.ts
// Ambient declarations for CodeMirror packages that are installed
// transitively through @codemirror/autocomplete (and other direct deps)
// but not hoisted to the project's top-level node_modules. These are
// available at runtime via pnpm's peer-dep resolution; this file just
// lets TypeScript find the types without adding new explicit
// dependencies to package.json.

declare module "@codemirror/language" {
  import type { Extension } from "@codemirror/state";
  import type { Tag } from "@lezer/highlight";

  export interface TagStyle {
    tag: Tag | readonly Tag[];
    color?: string;
    fontWeight?: string | number;
    fontStyle?: string;
    textDecoration?: string;
    backgroundColor?: string;
    [key: string]: unknown;
  }

  export class HighlightStyle {
    static define(
      specs: readonly TagStyle[],
      options?: { themeType?: "dark" | "light"; all?: TagStyle },
    ): HighlightStyle;
    readonly extension: Extension;
  }

  export function syntaxHighlighting(
    highlighter: HighlightStyle,
    options?: { fallback?: boolean },
  ): Extension;

  export const defaultHighlightStyle: HighlightStyle;

  export function bracketMatching(config?: unknown): Extension;
  export function indentOnInput(): Extension;
  export function foldGutter(config?: unknown): Extension;
}

declare module "@lezer/highlight" {
  export class Tag {
    readonly id: number;
    static define(parent?: Tag): Tag;
  }

  export interface Tags {
    comment: Tag;
    lineComment: Tag;
    blockComment: Tag;
    docComment: Tag;
    name: Tag;
    variableName: Tag;
    typeName: Tag;
    tagName: Tag;
    propertyName: Tag;
    attributeName: Tag;
    className: Tag;
    labelName: Tag;
    namespace: Tag;
    macroName: Tag;
    literal: Tag;
    string: Tag;
    docString: Tag;
    character: Tag;
    attributeValue: Tag;
    number: Tag;
    integer: Tag;
    float: Tag;
    bool: Tag;
    regexp: Tag;
    escape: Tag;
    color: Tag;
    url: Tag;
    keyword: Tag;
    self: Tag;
    null: Tag;
    atom: Tag;
    unit: Tag;
    modifier: Tag;
    operatorKeyword: Tag;
    controlKeyword: Tag;
    definitionKeyword: Tag;
    moduleKeyword: Tag;
    operator: Tag;
    derefOperator: Tag;
    arithmeticOperator: Tag;
    logicOperator: Tag;
    bitwiseOperator: Tag;
    compareOperator: Tag;
    updateOperator: Tag;
    definitionOperator: Tag;
    typeOperator: Tag;
    controlOperator: Tag;
    punctuation: Tag;
    separator: Tag;
    bracket: Tag;
    angleBracket: Tag;
    squareBracket: Tag;
    paren: Tag;
    brace: Tag;
    content: Tag;
    heading: Tag;
    heading1: Tag;
    heading2: Tag;
    heading3: Tag;
    heading4: Tag;
    heading5: Tag;
    heading6: Tag;
    contentSeparator: Tag;
    list: Tag;
    quote: Tag;
    emphasis: Tag;
    strong: Tag;
    link: Tag;
    monospace: Tag;
    strikethrough: Tag;
    inserted: Tag;
    deleted: Tag;
    changed: Tag;
    invalid: Tag;
    meta: Tag;
    documentMeta: Tag;
    annotation: Tag;
    processingInstruction: Tag;
    definition: (tag: Tag) => Tag;
    constant: (tag: Tag) => Tag;
    function: (tag: Tag) => Tag;
    standard: (tag: Tag) => Tag;
    local: (tag: Tag) => Tag;
    special: (tag: Tag) => Tag;
  }

  export const tags: Tags;
}
