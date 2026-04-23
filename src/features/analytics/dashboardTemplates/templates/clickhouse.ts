// src/features/analytics/dashboardTemplates/templates/clickhouse.ts
// Comprehensive ClickHouse server monitoring dashboard.
// Migrated from src/features/metrics/config/metricsConfig.ts

import { rawSqlConfig } from "../helpers";
import type { DashboardTemplate } from "../types";

export const clickhouseServerTemplate: DashboardTemplate = {
	id: "clickhouse-server",
	name: "ClickHouse Server",
	description:
		"Monitor ClickHouse server health, queries, memory, and disk usage",
	tags: ["ClickHouse", "Database", "Monitoring"],
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

## Template variables

This dashboard uses time range variables that adapt to your selected time range:
- \`$__timeFromTo\` - Date range for BETWEEN clauses
- \`$__timeBucket\` - Adaptive time grouping expression
- \`$__bucketSec\` - Bucket size in seconds
`,
	},
	tiles: [
		// ═══════════════════════════════════════════════════════════════════════
		// ROW 0: Overview metrics (4 number cards)
		// ═══════════════════════════════════════════════════════════════════════
		{
			id: "ch-uptime",
			title: "Server Uptime",
			x: 0,
			y: 0,
			w: 3,
			h: 2,
			config: rawSqlConfig(
				`SELECT CONCAT(
  CAST(ROUND(uptime() / 86400) AS String), 'd ',
  CAST(ROUND((uptime() % 86400) / 3600) AS String), 'h ',
  CAST(ROUND((uptime() % 3600) / 60) AS String), 'm'
) AS uptime_formatted`,
				"number",
			),
		},
		{
			id: "ch-databases",
			title: "Total Databases",
			x: 3,
			y: 0,
			w: 3,
			h: 2,
			config: rawSqlConfig(
				`SELECT COUNT(*) AS total_databases
FROM system.databases
WHERE name NOT IN ('system', 'information_schema')`,
				"number",
			),
		},
		{
			id: "ch-tables",
			title: "Total Tables",
			x: 6,
			y: 0,
			w: 3,
			h: 2,
			config: rawSqlConfig(
				`SELECT COUNT(*) AS total_tables
FROM system.tables
WHERE database NOT IN ('system', 'information_schema')
  AND is_temporary = 0
  AND engine LIKE '%MergeTree%'`,
				"number",
			),
		},
		{
			id: "ch-version",
			title: "Version",
			x: 9,
			y: 0,
			w: 3,
			h: 2,
			config: rawSqlConfig("SELECT version() AS version", "number"),
		},

		// ═══════════════════════════════════════════════════════════════════════
		// ROW 1: Query metrics (4 number cards)
		// ═══════════════════════════════════════════════════════════════════════
		{
			id: "ch-running-queries",
			title: "Running Queries",
			x: 0,
			y: 2,
			w: 3,
			h: 2,
			config: rawSqlConfig(
				`SELECT COUNT(*) AS running_queries
FROM system.processes
WHERE is_cancelled = 0 AND query NOT LIKE '%system%'`,
				"number",
			),
		},
		{
			id: "ch-error-rate",
			title: "Query Error Rate (%)",
			x: 3,
			y: 2,
			w: 3,
			h: 2,
			config: rawSqlConfig(
				`SELECT round(100 * failed / total, 2) AS error_rate
FROM (
  SELECT COUNT(*) AS total,
    COUNTIf(type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')) AS failed
  FROM system.query_log
  WHERE event_time BETWEEN $__timeFromTo
)`,
				"number",
			),
		},
		{
			id: "ch-avg-duration",
			title: "Avg Query Duration (ms)",
			x: 6,
			y: 2,
			w: 3,
			h: 2,
			config: rawSqlConfig(
				`SELECT round(avg(query_duration_ms), 2) AS avg_duration_ms
FROM system.query_log
WHERE type = 'QueryFinish'
  AND event_time BETWEEN $__timeFromTo`,
				"number",
			),
		},
		{
			id: "ch-total-queries",
			title: "Total Queries",
			x: 9,
			y: 2,
			w: 3,
			h: 2,
			config: rawSqlConfig(
				`SELECT COUNT(*) AS total_queries
FROM system.query_log
WHERE event_time BETWEEN $__timeFromTo`,
				"number",
			),
		},

		// ═══════════════════════════════════════════════════════════════════════
		// ROW 2: Time series charts (queries + duration)
		// ═══════════════════════════════════════════════════════════════════════
		{
			id: "ch-queries-chart",
			title: "Queries Over Time",
			x: 0,
			y: 4,
			w: 6,
			h: 5,
			config: rawSqlConfig(
				`SELECT
  $__timeBucket AS time_bucket,
  COUNT(*) AS query_count
FROM system.query_log
WHERE
  event_time BETWEEN $__timeFromTo
  AND type = 'QueryFinish'
GROUP BY time_bucket
ORDER BY time_bucket`,
				"line",
			),
		},
		{
			id: "ch-query-duration",
			title: "Query Duration (p50, p90, p99)",
			x: 6,
			y: 4,
			w: 6,
			h: 5,
			config: rawSqlConfig(
				`SELECT
  $__timeBucket AS time_bucket,
  quantile(0.5)(query_duration_ms) AS p50,
  quantile(0.9)(query_duration_ms) AS p90,
  quantile(0.99)(query_duration_ms) AS p99
FROM system.query_log
WHERE event_time BETWEEN $__timeFromTo
  AND type = 'QueryFinish'
GROUP BY $__timeBucket
ORDER BY time_bucket`,
				"line",
			),
		},

		// ═══════════════════════════════════════════════════════════════════════
		// ROW 3: Performance charts (CPU, Memory)
		// ═══════════════════════════════════════════════════════════════════════
		{
			id: "ch-cpu-chart",
			title: "Read Bytes Over Time",
			x: 0,
			y: 9,
			w: 6,
			h: 5,
			config: rawSqlConfig(
				`SELECT
  $__timeBucket AS time_bucket,
  sum(read_bytes) AS read_bytes
FROM system.query_log
WHERE event_time BETWEEN $__timeFromTo
  AND type = 'QueryFinish'
GROUP BY time_bucket
ORDER BY time_bucket`,
				"line",
			),
		},
		{
			id: "ch-memory-chart",
			title: "Memory Usage Over Time",
			x: 6,
			y: 9,
			w: 6,
			h: 5,
			config: rawSqlConfig(
				`SELECT
  $__timeBucket AS time_bucket,
  max(memory_usage) AS peak_memory
FROM system.query_log
WHERE event_time BETWEEN $__timeFromTo
  AND type = 'QueryFinish'
GROUP BY time_bucket
ORDER BY time_bucket`,
				"area",
			),
		},

		// ═══════════════════════════════════════════════════════════════════════
		// ROW 4: Network and Threads
		// ═══════════════════════════════════════════════════════════════════════
		{
			id: "ch-network-traffic",
			title: "Written Bytes Over Time",
			x: 0,
			y: 14,
			w: 6,
			h: 5,
			config: rawSqlConfig(
				`SELECT
  $__timeBucket AS time_bucket,
  sum(written_bytes) AS written_bytes
FROM system.query_log
WHERE event_time BETWEEN $__timeFromTo
  AND type = 'QueryFinish'
GROUP BY time_bucket
ORDER BY time_bucket`,
				"area",
			),
		},
		{
			id: "ch-rows-read",
			title: "Rows Read Over Time",
			x: 6,
			y: 14,
			w: 6,
			h: 5,
			config: rawSqlConfig(
				`SELECT
  $__timeBucket AS time_bucket,
  sum(read_rows) AS rows_read
FROM system.query_log
WHERE event_time BETWEEN $__timeFromTo
  AND type = 'QueryFinish'
GROUP BY time_bucket
ORDER BY time_bucket`,
				"line",
			),
		},

		// ═══════════════════════════════════════════════════════════════════════
		// ROW 5: Query duration distribution + Queries per minute
		// ═══════════════════════════════════════════════════════════════════════
		{
			id: "ch-duration-distribution",
			title: "Query Duration Distribution",
			x: 0,
			y: 19,
			w: 6,
			h: 5,
			config: rawSqlConfig(
				`SELECT
  CASE
    WHEN query_duration_ms < 10 THEN '<10ms'
    WHEN query_duration_ms < 20 THEN '10ms-20ms'
    WHEN query_duration_ms < 50 THEN '20ms-50ms'
    WHEN query_duration_ms < 100 THEN '50ms-100ms'
    WHEN query_duration_ms < 200 THEN '100ms-200ms'
    WHEN query_duration_ms < 500 THEN '200ms-500ms'
    WHEN query_duration_ms < 1000 THEN '500ms-1s'
    WHEN query_duration_ms < 5000 THEN '1s-5s'
    WHEN query_duration_ms < 30000 THEN '5s-30s'
    ELSE '>30s'
  END AS duration_bucket,
  COUNT(*) AS query_count
FROM system.query_log
WHERE type = 'QueryFinish'
  AND event_time BETWEEN $__timeFromTo
GROUP BY duration_bucket
ORDER BY duration_bucket`,
				"bar",
			),
		},
		{
			id: "ch-qpm",
			title: "Finished Queries Over Time",
			x: 6,
			y: 19,
			w: 6,
			h: 5,
			config: rawSqlConfig(
				`SELECT
  $__timeBucket AS time_bucket,
  COUNT(*) AS queries
FROM system.query_log
WHERE type = 'QueryFinish'
  AND event_time BETWEEN $__timeFromTo
GROUP BY time_bucket
ORDER BY time_bucket`,
				"area",
			),
		},

		// ═══════════════════════════════════════════════════════════════════════
		// ROW 6: Storage charts (disk usage, database sizes)
		// ═══════════════════════════════════════════════════════════════════════
		{
			id: "ch-table-sizes",
			title: "Table Sizes (MB)",
			x: 0,
			y: 24,
			w: 6,
			h: 5,
			config: rawSqlConfig(
				`SELECT name, total_bytes / 1024 / 1024 AS total_mb
FROM system.tables
WHERE database NOT IN ('system', 'information_schema')
ORDER BY total_mb DESC
LIMIT 20`,
				"bar",
			),
		},
		{
			id: "ch-database-sizes",
			title: "Database Sizes (GB)",
			x: 6,
			y: 24,
			w: 6,
			h: 5,
			config: rawSqlConfig(
				`SELECT database, round(sum(total_bytes) / 1024 / 1024 / 1024, 2) AS size_gb
FROM system.tables
GROUP BY database
ORDER BY size_gb DESC
LIMIT 20`,
				"bar",
			),
		},

		// ═══════════════════════════════════════════════════════════════════════
		// ROW 7: Table parts and engine distribution
		// ═══════════════════════════════════════════════════════════════════════
		{
			id: "ch-parts-per-table",
			title: "Parts per Table",
			x: 0,
			y: 29,
			w: 6,
			h: 5,
			config: rawSqlConfig(
				`SELECT CONCAT(database, '.', table) AS table_name, COUNT(*) AS part_count
FROM system.parts
WHERE active = 1
GROUP BY database, table
ORDER BY part_count DESC
LIMIT 20`,
				"bar",
			),
		},
		{
			id: "ch-engine-distribution",
			title: "Table Engine Distribution",
			x: 6,
			y: 29,
			w: 6,
			h: 5,
			config: rawSqlConfig(
				`SELECT engine, COUNT(*) AS table_count
FROM system.tables
WHERE database NOT IN ('system', 'information_schema')
GROUP BY engine
ORDER BY table_count DESC
LIMIT 15`,
				"bar",
			),
		},

		// ═══════════════════════════════════════════════════════════════════════
		// ROW 8: Most used tables + Exceptions over time
		// ═══════════════════════════════════════════════════════════════════════
		{
			id: "ch-most-used-tables",
			title: "Most Queried Tables",
			x: 0,
			y: 34,
			w: 6,
			h: 5,
			config: rawSqlConfig(
				`SELECT t AS table, COUNT(*) AS query_count
FROM (
  SELECT arrayJoin(tables) AS t
  FROM system.query_log
  WHERE event_time BETWEEN $__timeFromTo
    AND type = 'QueryFinish'
)
GROUP BY t
ORDER BY query_count DESC
LIMIT 10`,
				"bar",
			),
		},
		{
			id: "ch-exceptions-chart",
			title: "Exceptions Over Time",
			x: 6,
			y: 34,
			w: 6,
			h: 5,
			config: rawSqlConfig(
				`SELECT $__timeGroupExpr AS time_bucket, COUNT(*) AS exception_count
FROM system.query_log
WHERE type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')
  AND event_time BETWEEN $__timeFromTo
GROUP BY time_bucket
ORDER BY time_bucket`,
				"line",
			),
		},

		// ═══════════════════════════════════════════════════════════════════════
		// ROW 9-10: Tables (running queries, slow queries)
		// ═══════════════════════════════════════════════════════════════════════
		{
			id: "ch-running-queries-table",
			title: "Running Queries",
			x: 0,
			y: 39,
			w: 12,
			h: 6,
			config: rawSqlConfig(
				`SELECT
  query_id,
  user,
  elapsed,
  read_rows,
  formatReadableSize(memory_usage) AS memory,
  substring(query, 1, 100) AS query_preview
FROM system.processes
WHERE is_cancelled = 0
ORDER BY elapsed DESC
LIMIT 20`,
				"table",
			),
		},
		{
			id: "ch-slow-queries-table",
			title: "Slowest Queries",
			x: 0,
			y: 45,
			w: 12,
			h: 6,
			config: rawSqlConfig(
				`SELECT
  substring(query, 1, 80) AS query_preview,
  query_duration_ms,
  formatReadableSize(memory_usage) AS memory,
  event_time
FROM system.query_log
WHERE event_time BETWEEN $__timeFromTo
  AND type = 'QueryFinish'
  AND query_kind = 'Select'
ORDER BY query_duration_ms DESC
LIMIT 10`,
				"table",
			),
		},

		// ═══════════════════════════════════════════════════════════════════════
		// ROW 11-12: Top tables by size + Disk usage
		// ═══════════════════════════════════════════════════════════════════════
		{
			id: "ch-top-tables",
			title: "Top Tables by Size",
			x: 0,
			y: 51,
			w: 6,
			h: 6,
			config: rawSqlConfig(
				`SELECT
  concat(database, '.', table) AS table_name,
  formatReadableSize(sum(bytes_on_disk)) AS size,
  sum(rows) AS rows,
  count() AS parts
FROM system.parts
WHERE active
GROUP BY database, table
ORDER BY sum(bytes_on_disk) DESC
LIMIT 10`,
				"table",
			),
		},
		{
			id: "ch-disk-usage-table",
			title: "Disk Usage",
			x: 6,
			y: 51,
			w: 6,
			h: 6,
			config: rawSqlConfig(
				`SELECT
  name,
  round(total_space / 1024 / 1024 / 1024, 2) AS total_gb,
  round(free_space / 1024 / 1024 / 1024, 2) AS free_gb,
  round((1 - free_space / total_space) * 100, 2) AS used_percent
FROM system.disks`,
				"table",
			),
		},

		// ═══════════════════════════════════════════════════════════════════════
		// ROW 13: Queries by user + Table cardinality
		// ═══════════════════════════════════════════════════════════════════════
		{
			id: "ch-queries-by-user",
			title: "Queries Per User",
			x: 0,
			y: 57,
			w: 6,
			h: 6,
			config: rawSqlConfig(
				`SELECT user, COUNT(*) AS query_count
FROM system.query_log
WHERE event_time BETWEEN $__timeFromTo
  AND type = 'QueryFinish'
GROUP BY user
ORDER BY query_count DESC
LIMIT 10`,
				"table",
			),
		},
		{
			id: "ch-table-cardinality",
			title: "Table Cardinality",
			x: 6,
			y: 57,
			w: 6,
			h: 6,
			config: rawSqlConfig(
				`SELECT database, name AS table, total_rows
FROM system.tables
WHERE database NOT IN ('system', 'information_schema')
ORDER BY total_rows DESC
LIMIT 10`,
				"table",
			),
		},

		// ═══════════════════════════════════════════════════════════════════════
		// ROW 14: Exception details
		// ═══════════════════════════════════════════════════════════════════════
		{
			id: "ch-recent-exceptions",
			title: "Recent Exceptions",
			x: 0,
			y: 63,
			w: 6,
			h: 6,
			config: rawSqlConfig(
				`SELECT event_time, user, substring(query, 1, 60) AS query, exception
FROM system.query_log
WHERE type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')
  AND event_time BETWEEN $__timeFromTo
ORDER BY event_time DESC
LIMIT 10`,
				"table",
			),
		},
		{
			id: "ch-common-exceptions",
			title: "Most Common Exceptions",
			x: 6,
			y: 63,
			w: 6,
			h: 6,
			config: rawSqlConfig(
				`SELECT exception, COUNT(*) AS count
FROM system.query_log
WHERE type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')
  AND event_time BETWEEN $__timeFromTo
GROUP BY exception
ORDER BY count DESC
LIMIT 10`,
				"table",
			),
		},
	],
};
