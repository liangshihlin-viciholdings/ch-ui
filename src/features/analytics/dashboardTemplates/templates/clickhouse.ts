// src/features/analytics/dashboardTemplates/templates/clickhouse.ts
import type { DashboardTemplate } from "../types";
import { rawSqlConfig } from "../helpers";

export const clickhouseServerTemplate: DashboardTemplate = {
  id: "clickhouse-server",
  name: "ClickHouse Server",
  description: "Monitor ClickHouse server health, queries, memory, and disk usage",
  tags: ["ClickHouse", "Database"],
  setupGuide: {
    title: "ClickHouse Server Monitoring",
    docsUrl: "https://clickhouse.com/docs/en/operations/system-tables",
    content: `
This dashboard queries ClickHouse system tables directly. **No additional setup required** if you're connected to a ClickHouse server.

## Verify system tables access

Run these queries to ensure your user has access:

\`\`\`sql
SELECT * FROM system.metrics LIMIT 5;
SELECT * FROM system.query_log LIMIT 5;
SELECT * FROM system.parts LIMIT 5;
\`\`\`

## Enable query logging (if needed)

Query logging is usually enabled by default. If \`system.query_log\` is empty, ensure it's configured in your ClickHouse config:

\`\`\`xml
<query_log>
  <database>system</database>
  <table>query_log</table>
  <flush_interval_milliseconds>7500</flush_interval_milliseconds>
</query_log>
\`\`\`
`,
  },
  tiles: [
    // Row 0: Metrics (4 cards, w=3 each = 12 cols)
    {
      id: "ch-queries-running",
      title: "Running Queries",
      x: 0,
      y: 0,
      w: 3,
      h: 2,
      config: rawSqlConfig(
        "SELECT value FROM system.metrics WHERE metric = 'Query'",
        "number"
      ),
    },
    {
      id: "ch-memory-used",
      title: "Memory Used",
      x: 3,
      y: 0,
      w: 3,
      h: 2,
      config: rawSqlConfig(
        "SELECT formatReadableSize(sum(value)) as memory FROM system.metrics WHERE metric IN ('MemoryTracking')",
        "number"
      ),
    },
    {
      id: "ch-connections",
      title: "Active Connections",
      x: 6,
      y: 0,
      w: 3,
      h: 2,
      config: rawSqlConfig(
        "SELECT value FROM system.metrics WHERE metric = 'TCPConnection'",
        "number"
      ),
    },
    {
      id: "ch-parts-count",
      title: "Total Parts",
      x: 9,
      y: 0,
      w: 3,
      h: 2,
      config: rawSqlConfig(
        "SELECT count() FROM system.parts WHERE active",
        "number"
      ),
    },
    // Row 1: Time series charts (2 charts, w=6 each)
    {
      id: "ch-queries-chart",
      title: "Queries Over Time",
      x: 0,
      y: 2,
      w: 6,
      h: 5,
      config: rawSqlConfig(
        `SELECT
          toStartOfMinute(event_time) as time_bucket,
          count() as queries
        FROM system.query_log
        WHERE event_time >= now() - INTERVAL 1 HOUR
          AND type = 'QueryFinish'
        GROUP BY time_bucket
        ORDER BY time_bucket`,
        "line"
      ),
    },
    {
      id: "ch-query-duration",
      title: "Query Duration (p50, p90, p99)",
      x: 6,
      y: 2,
      w: 6,
      h: 5,
      config: rawSqlConfig(
        `SELECT
          toStartOfMinute(event_time) as time_bucket,
          quantile(0.5)(query_duration_ms) as p50,
          quantile(0.9)(query_duration_ms) as p90,
          quantile(0.99)(query_duration_ms) as p99
        FROM system.query_log
        WHERE event_time >= now() - INTERVAL 1 HOUR
          AND type = 'QueryFinish'
        GROUP BY time_bucket
        ORDER BY time_bucket`,
        "line"
      ),
    },
    // Row 2: More charts (area + bar)
    {
      id: "ch-memory-chart",
      title: "Memory Usage Over Time",
      x: 0,
      y: 7,
      w: 6,
      h: 5,
      config: rawSqlConfig(
        `SELECT
          toStartOfMinute(event_time) as time_bucket,
          max(memory_usage) as memory_bytes
        FROM system.query_log
        WHERE event_time >= now() - INTERVAL 1 HOUR
        GROUP BY time_bucket
        ORDER BY time_bucket`,
        "area"
      ),
    },
    {
      id: "ch-disk-usage",
      title: "Disk Usage by Database",
      x: 6,
      y: 7,
      w: 6,
      h: 5,
      config: rawSqlConfig(
        `SELECT
          database,
          sum(bytes_on_disk) as size_bytes
        FROM system.parts
        WHERE active
        GROUP BY database
        ORDER BY size_bytes DESC
        LIMIT 10`,
        "bar"
      ),
    },
    // Row 3: Tables (2 tables, w=6 each)
    {
      id: "ch-top-tables",
      title: "Top Tables by Size",
      x: 0,
      y: 12,
      w: 6,
      h: 5,
      config: rawSqlConfig(
        `SELECT
          concat(database, '.', table) as table_name,
          formatReadableSize(sum(bytes_on_disk)) as size,
          sum(rows) as rows,
          count() as parts
        FROM system.parts
        WHERE active
        GROUP BY database, table
        ORDER BY sum(bytes_on_disk) DESC
        LIMIT 10`,
        "table"
      ),
    },
    {
      id: "ch-slow-queries",
      title: "Slowest Queries (Last Hour)",
      x: 6,
      y: 12,
      w: 6,
      h: 5,
      config: rawSqlConfig(
        `SELECT
          substring(query, 1, 80) as query_preview,
          query_duration_ms,
          formatReadableSize(memory_usage) as memory,
          event_time
        FROM system.query_log
        WHERE event_time >= now() - INTERVAL 1 HOUR
          AND type = 'QueryFinish'
          AND query_kind = 'Select'
        ORDER BY query_duration_ms DESC
        LIMIT 10`,
        "table"
      ),
    },
  ],
};
