// PROTOTYPE — throwaway. Mock data for the multi-DB workbench shell redesign.
// Answers: "what should the multi-DB shell look like?" Delete once a variant wins.
import type { LucideIcon } from "lucide-react";
import { Database, HardDrive, Boxes, FileBox, Server } from "lucide-react";

export type Engine =
  | "clickhouse"
  | "postgres"
  | "mysql"
  | "sqlite"
  | "duckdb";

export interface EngineMeta {
  id: Engine;
  label: string;
  /** server-based (host/port/creds) vs file-based (path picker) */
  kind: "server" | "file";
  /** tailwind classes for the engine accent dot/badge */
  dot: string;
  badge: string;
  icon: LucideIcon;
}

export const ENGINES: Record<Engine, EngineMeta> = {
  clickhouse: {
    id: "clickhouse",
    label: "ClickHouse",
    kind: "server",
    dot: "bg-yellow-400",
    badge: "bg-yellow-400/15 text-yellow-600 dark:text-yellow-400",
    icon: Database,
  },
  postgres: {
    id: "postgres",
    label: "PostgreSQL",
    kind: "server",
    dot: "bg-sky-500",
    badge: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    icon: Server,
  },
  mysql: {
    id: "mysql",
    label: "MySQL",
    kind: "server",
    dot: "bg-teal-500",
    badge: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
    icon: Boxes,
  },
  sqlite: {
    id: "sqlite",
    label: "SQLite",
    kind: "file",
    dot: "bg-indigo-400",
    badge: "bg-indigo-400/15 text-indigo-600 dark:text-indigo-400",
    icon: HardDrive,
  },
  duckdb: {
    id: "duckdb",
    label: "DuckDB",
    kind: "file",
    dot: "bg-amber-500",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    icon: FileBox,
  },
};

export interface MockConnection {
  id: string;
  name: string;
  engine: Engine;
  /** server engines */
  host?: string;
  port?: number;
  database?: string;
  /** file engines */
  filePath?: string;
  status: "connected" | "idle" | "disconnected";
  schemas: MockSchema[];
}

export interface MockSchema {
  name: string;
  tables: { name: string; rows: string; cols: number }[];
}

export const CONNECTIONS: MockConnection[] = [
  {
    id: "c-ch",
    name: "analytics-prod",
    engine: "clickhouse",
    host: "ch.internal",
    port: 8443,
    database: "events",
    status: "connected",
    schemas: [
      {
        name: "events",
        tables: [
          { name: "page_views", rows: "1.2B", cols: 14 },
          { name: "sessions", rows: "88M", cols: 9 },
          { name: "users", rows: "12M", cols: 21 },
        ],
      },
      {
        name: "system",
        tables: [
          { name: "tables", rows: "412", cols: 30 },
          { name: "parts", rows: "9.1K", cols: 42 },
        ],
      },
    ],
  },
  {
    id: "c-pg",
    name: "billing-pg",
    engine: "postgres",
    host: "db-billing.aws",
    port: 5432,
    database: "billing",
    status: "connected",
    schemas: [
      {
        name: "public",
        tables: [
          { name: "invoices", rows: "4.3M", cols: 18 },
          { name: "customers", rows: "910K", cols: 24 },
          { name: "line_items", rows: "31M", cols: 11 },
        ],
      },
    ],
  },
  {
    id: "c-my",
    name: "wordpress",
    engine: "mysql",
    host: "127.0.0.1",
    port: 3306,
    database: "wp",
    status: "idle",
    schemas: [
      {
        name: "wp",
        tables: [
          { name: "wp_posts", rows: "52K", cols: 23 },
          { name: "wp_users", rows: "1.1K", cols: 10 },
        ],
      },
    ],
  },
  {
    id: "c-sq",
    name: "local-cache.db",
    engine: "sqlite",
    filePath: "~/data/local-cache.db",
    status: "disconnected",
    schemas: [
      {
        name: "main",
        tables: [
          { name: "kv_store", rows: "8.2K", cols: 3 },
          { name: "migrations", rows: "47", cols: 4 },
        ],
      },
    ],
  },
  {
    id: "c-dk",
    name: "scratch.duckdb",
    engine: "duckdb",
    filePath: "~/analysis/scratch.duckdb",
    status: "idle",
    schemas: [
      {
        name: "main",
        tables: [
          { name: "nyc_taxi", rows: "1.5B", cols: 19 },
          { name: "weather", rows: "2.4M", cols: 8 },
        ],
      },
    ],
  },
];

export interface MockTab {
  id: string;
  title: string;
  connectionId: string;
  dirty?: boolean;
  sql: string;
}

export const TABS: MockTab[] = [
  {
    id: "t1",
    title: "top pages",
    connectionId: "c-ch",
    dirty: true,
    sql: "SELECT path, count() AS views\nFROM events.page_views\nWHERE date >= today() - 7\nGROUP BY path\nORDER BY views DESC\nLIMIT 100",
  },
  {
    id: "t2",
    title: "unpaid invoices",
    connectionId: "c-pg",
    sql: "SELECT i.id, c.name, i.amount\nFROM invoices i\nJOIN customers c ON c.id = i.customer_id\nWHERE i.status = 'open'\nORDER BY i.amount DESC;",
  },
  {
    id: "t3",
    title: "taxi sample",
    connectionId: "c-dk",
    sql: "SELECT passenger_count, avg(fare_amount)\nFROM nyc_taxi\nGROUP BY 1 ORDER BY 1;",
  },
];

export const SAMPLE_COLUMNS = ["path", "views"];
export const SAMPLE_ROWS: [string, string][] = [
  ["/pricing", "482,193"],
  ["/", "311,820"],
  ["/docs/getting-started", "208,442"],
  ["/blog/multi-db-workbench", "142,006"],
  ["/login", "98,771"],
];

export function connOf(id: string) {
  return CONNECTIONS.find((c) => c.id === id)!;
}
