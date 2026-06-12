# Prototype verdict — multi-DB workbench shell

**Question:** What should the multi-DB (CH/PG/MySQL/SQLite/DuckDB) Electron workbench shell look like?

## Round 1 — A / B / C (2026-06-12)
- **A (DBeaver-style navigator): WINNER.** Single left navigator, editor+results right.
- B (connection rail + contextual explorer): rejected — 3 sidebars felt cluttered.
- C (command-bar + per-tab pills): rejected — too unfamiliar.

## Round 2 — A-family: A1 / A2 / A3 (2026-06-12)
- A1 (unified nested tree): rejected — deep nesting, scales poorly with many connections.
- **A2 (split navigator: connection list top, active connection's schema tree bottom): WINNER.**
- A3 (search-first + metadata preview): rejected as a whole, but its filter box was grafted onto A2.

## Final tweaks applied to A2
1. Filter box grafted from A3 into the schema tree.
2. Tables expand to show columns + types inline (tree goes one level deeper).
3. Tab ↔ navigator sync: focusing a tab highlights its bound connection in the list
   (the A2 expression of "explorer follows the focused tab").

## Carry into the real implementation
- Split navigator: connection list (engine dot, name, host/file, status) over scoped schema tree.
- Save-query dialog: autofocused name input inside a <form> — Enter saves, Esc cancels.
- New-connection dialog: engine picker drives the form; server engines (host/port/creds)
  vs file engines (native file picker, DuckDB :memory: hint).
- Engine identity = colored dot + icon; connection status = green/amber/gray dot.
- Per-tab connection binding shown as a pill in the editor toolbar.
