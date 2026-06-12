// Engine metadata — visual identity per database engine.
import type { LucideIcon } from "lucide-react";
import { Database, HardDrive, Boxes, FileBox, Server } from "lucide-react";
import type { Engine } from "@/lib/db/schema";

export interface EngineMeta {
  id: Engine;
  label: string;
  kind: "server" | "file";
  dot: string;
  badge: string;
  icon: LucideIcon;
  defaultPort?: number;
}

export const ENGINES: Record<Engine, EngineMeta> = {
  clickhouse: {
    id: "clickhouse",
    label: "ClickHouse",
    kind: "server",
    dot: "bg-yellow-400",
    badge: "bg-yellow-400/15 text-yellow-600 dark:text-yellow-400",
    icon: Database,
    defaultPort: 8443,
  },
  postgres: {
    id: "postgres",
    label: "PostgreSQL",
    kind: "server",
    dot: "bg-sky-500",
    badge: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    icon: Server,
    defaultPort: 5432,
  },
  mysql: {
    id: "mysql",
    label: "MySQL",
    kind: "server",
    dot: "bg-teal-500",
    badge: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
    icon: Boxes,
    defaultPort: 3306,
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
