# deebee 🚀

A modern, multi-database SQL workbench. Query **ClickHouse, PostgreSQL, MySQL, SQLite, and DuckDB** from one fast interface — on the desktop or in the browser.

> Data is better when we see it.

## ✨ Features

- **One workbench, many databases** — connect to ClickHouse, PostgreSQL, MySQL, SQLite, and DuckDB side by side, each tab bound to its own connection.
- **Powerful SQL editor** — CodeMirror-based, with schema-aware autocomplete, linting, multi-tab editing, an optional Vim mode, and run-on-`⌘/Ctrl+Enter`.
- **Unified sidebar** — app navigation, your connections, and a live schema browser (database → table → column) in a single resizable panel, plus a `⌘K` command palette and saved queries.
- **Rich results grid** — sortable, paginated tables with a cell inspector and one-click copy / export (CSV, JSON, and more).
- **Connection management** — save, edit, import, and export connections; secrets are encrypted via the OS keychain on desktop.
- **ClickHouse observability suite** — dashboards & charts, log search, OpenTelemetry trace explorer, session and service views, and alerts.
- **ClickHouse admin** — manage users, roles, grants, row policies, and quotas, with distributed (`ON CLUSTER`) support.
- **Themeable** — a large set of light and dark UI + editor themes.
- **Desktop or web** — ships as an Electron desktop app or a single Docker container.

## 🗄️ Supported databases

| Engine | Desktop app | Web (Docker) |
| --- | :---: | :---: |
| ClickHouse | ✅ | ✅ |
| PostgreSQL | ✅ | — |
| MySQL | ✅ | — |
| SQLite | ✅ | — |
| DuckDB | ✅ | — |

The desktop app talks to every engine directly; the web build currently focuses on ClickHouse.

## 🚀 Quick start

**Web (Docker)**

```bash
docker run --name deebee -p 5521:5521 ghcr.io/caioricciuti/ch-ui:latest
```

Then open http://localhost:5521.

**Desktop (build locally)**

```bash
pnpm install
pnpm dist:desktop   # produces a Linux AppImage in dist-electron-out/
```

**Local development**

```bash
pnpm install
pnpm dev            # web dev server
pnpm dev:desktop    # Electron dev shell
```

## ⚙️ Configuration

The web build can be pre-seeded with a ClickHouse connection via environment variables (read at container start):

| Variable | Description |
| --- | --- |
| `VITE_CLICKHOUSE_URL` | ClickHouse HTTP(S) URL |
| `VITE_CLICKHOUSE_USER` | Username |
| `VITE_CLICKHOUSE_PASS` | Password |
| `VITE_CLICKHOUSE_DATABASE` | Default database (optional) |
| `VITE_BASE_PATH` | Base path when served behind a reverse proxy (e.g. `/deebee`) |

## 🙏 Credits

deebee is a fork of [**CH-UI**](https://github.com/caioricciuti/ch-ui) by [Caio Ricciuti](https://github.com/caioricciuti), extended from a ClickHouse UI into a multi-database workbench. Huge thanks to the original project and its contributors.

## 📄 License

[Apache-2.0](LICENSE) — inherited from the upstream CH-UI project.
