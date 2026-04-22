import { useCallback } from "react";
import useAppStore from "@/stores/workspaceStore";
import { PendingChange, ChangeExecutionResult } from "../types";

/**
 * Audit log entry structure
 */
export interface AuditLogEntry {
  /** Unique identifier for this audit entry */
  id: string;

  /** Timestamp when the change was executed */
  timestamp: Date;

  /** Username who executed the change */
  username: string;

  /** Type of operation (GRANT, REVOKE, CREATE, ALTER, DROP) */
  operation: string;

  /** Entity type being modified */
  entityType: string;

  /** Name of the entity */
  entityName: string;

  /** Human-readable description */
  description: string;

  /** SQL statements that were executed */
  sqlStatements: string[];

  /** State before the change (JSON) */
  beforeState?: Record<string, any>;

  /** State after the change (JSON) */
  afterState?: Record<string, any>;

  /** Whether the execution was successful */
  success: boolean;

  /** Error message if execution failed */
  errorMessage?: string;

  /** Client IP address (if available) */
  clientIp?: string;

  /** Session ID (if available) */
  sessionId?: string;
}

/**
 * Audit log query filters
 */
export interface AuditLogFilters {
  /** Filter by username */
  username?: string;

  /** Filter by operation type */
  operation?: string;

  /** Filter by entity type */
  entityType?: string;

  /** Filter by success/failure */
  success?: boolean;

  /** Filter by date range (start) */
  startDate?: Date;

  /** Filter by date range (end) */
  endDate?: Date;

  /** Limit number of results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

/**
 * Hook for managing audit logs
 */
export function useAuditLog() {
  const { runQuery, credential } = useAppStore();

  /**
   * Initialize the audit log table in ClickHouse
   */
  const initializeAuditTable = useCallback(async (): Promise<boolean> => {
    try {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS ch_ui_audit_log (
          id String,
          timestamp DateTime64(3),
          username String,
          operation String,
          entity_type String,
          entity_name String,
          description String,
          sql_statements Array(String),
          before_state String,  -- JSON encoded
          after_state String,   -- JSON encoded
          success UInt8,
          error_message String,
          client_ip String,
          session_id String
        )
        ENGINE = MergeTree()
        ORDER BY (timestamp, username)
        PARTITION BY toYYYYMM(timestamp)
        TTL timestamp + INTERVAL 90 DAY  -- Retain for 90 days
        SETTINGS index_granularity = 8192;
      `;

      await runQuery(createTableSQL);
      return true;
    } catch (error) {
      console.error("Failed to initialize audit log table:", error);
      return false;
    }
  }, [runQuery]);

  /**
   * Log a permission change to the audit table
   */
  const logChange = useCallback(
    async (
      change: PendingChange,
      result: ChangeExecutionResult,
      username: string
    ): Promise<void> => {
      try {
        const entry: AuditLogEntry = {
          id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          username,
          operation: change.type,
          entityType: change.entityType,
          entityName: change.entityName,
          description: change.description,
          sqlStatements: change.sqlStatements,
          beforeState: change.originalState,
          afterState: change.newState,
          success: result.success,
          errorMessage: result.error,
          clientIp: "", // Would need to be obtained from request headers
          sessionId: "", // Would need to be obtained from session management
        };

        // Helper to escape SQL strings
        const escapeString = (str: string) => str.replace(/'/g, "''").replace(/\\/g, "\\\\");

        // Helper to format array for ClickHouse
        const formatArray = (arr: string[]) =>
          `[${arr.map(s => `'${escapeString(s)}'`).join(',')}]`;

        const insertSQL = `
          INSERT INTO ch_ui_audit_log (
            id,
            timestamp,
            username,
            operation,
            entity_type,
            entity_name,
            description,
            sql_statements,
            before_state,
            after_state,
            success,
            error_message,
            client_ip,
            session_id
          ) VALUES (
            '${escapeString(entry.id)}',
            '${entry.timestamp.toISOString()}',
            '${escapeString(entry.username)}',
            '${escapeString(entry.operation)}',
            '${escapeString(entry.entityType)}',
            '${escapeString(entry.entityName)}',
            '${escapeString(entry.description)}',
            ${formatArray(entry.sqlStatements)},
            '${escapeString(JSON.stringify(entry.beforeState || {}))}',
            '${escapeString(JSON.stringify(entry.afterState || {}))}',
            ${entry.success ? 1 : 0},
            '${escapeString(entry.errorMessage || "")}',
            '${escapeString(entry.clientIp || "")}',
            '${escapeString(entry.sessionId || "")}'
          )
        `;

        await runQuery(insertSQL);
      } catch (error) {
        // Don't throw - logging failure shouldn't break the main operation
        console.error("Failed to log audit entry:", error);
      }
    },
    [runQuery]
  );

  /**
   * Query audit logs with filters
   */
  const queryAuditLogs = useCallback(
    async (filters: AuditLogFilters = {}): Promise<AuditLogEntry[]> => {
      try {
        let whereClause = "WHERE 1=1";

        if (filters.username) {
          whereClause += ` AND username = '${filters.username.replace(/'/g, "''")}'`;
        }

        if (filters.operation) {
          whereClause += ` AND operation = '${filters.operation.replace(/'/g, "''")}'`;
        }

        if (filters.entityType) {
          whereClause += ` AND entity_type = '${filters.entityType.replace(/'/g, "''")}'`;
        }

        if (filters.success !== undefined) {
          whereClause += ` AND success = ${filters.success ? 1 : 0}`;
        }

        if (filters.startDate) {
          whereClause += ` AND timestamp >= '${filters.startDate.toISOString()}'`;
        }

        if (filters.endDate) {
          whereClause += ` AND timestamp <= '${filters.endDate.toISOString()}'`;
        }

        const limit = filters.limit || 100;
        const offset = filters.offset || 0;

        const querySQL = `
          SELECT
            id,
            timestamp,
            username,
            operation,
            entity_type,
            entity_name,
            description,
            sql_statements,
            before_state,
            after_state,
            success,
            error_message,
            client_ip,
            session_id
          FROM ch_ui_audit_log
          ${whereClause}
          ORDER BY timestamp DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `;

        const result = await runQuery(querySQL);

        // Parse the result into AuditLogEntry objects
        const entries: AuditLogEntry[] = (result.data || []).map((row: any) => ({
          id: row.id,
          timestamp: new Date(row.timestamp),
          username: row.username,
          operation: row.operation,
          entityType: row.entity_type,
          entityName: row.entity_name,
          description: row.description,
          sqlStatements: row.sql_statements,
          beforeState: row.before_state ? JSON.parse(row.before_state) : undefined,
          afterState: row.after_state ? JSON.parse(row.after_state) : undefined,
          success: row.success === 1,
          errorMessage: row.error_message || undefined,
          clientIp: row.client_ip || undefined,
          sessionId: row.session_id || undefined,
        }));

        return entries;
      } catch (error) {
        console.error("Failed to query audit logs:", error);
        return [];
      }
    },
    [runQuery]
  );

  /**
   * Get audit log statistics
   */
  const getAuditStats = useCallback(async (): Promise<{
    totalChanges: number;
    successfulChanges: number;
    failedChanges: number;
    recentActivity: Array<{ date: string; count: number }>;
    topUsers: Array<{ username: string; count: number }>;
    operationBreakdown: Array<{ operation: string; count: number }>;
  }> => {
    try {
      const statsSQL = `
        SELECT
          count() as total_changes,
          countIf(success = 1) as successful_changes,
          countIf(success = 0) as failed_changes
        FROM ch_ui_audit_log
      `;

      const recentActivitySQL = `
        SELECT
          toDate(timestamp) as date,
          count() as count
        FROM ch_ui_audit_log
        WHERE timestamp >= now() - INTERVAL 30 DAY
        GROUP BY date
        ORDER BY date DESC
        LIMIT 30
      `;

      const topUsersSQL = `
        SELECT
          username,
          count() as count
        FROM ch_ui_audit_log
        WHERE timestamp >= now() - INTERVAL 30 DAY
        GROUP BY username
        ORDER BY count DESC
        LIMIT 10
      `;

      const operationBreakdownSQL = `
        SELECT
          operation,
          count() as count
        FROM ch_ui_audit_log
        WHERE timestamp >= now() - INTERVAL 30 DAY
        GROUP BY operation
        ORDER BY count DESC
      `;

      const [stats, recentActivity, topUsers, operationBreakdown] = await Promise.all([
        runQuery(statsSQL),
        runQuery(recentActivitySQL),
        runQuery(topUsersSQL),
        runQuery(operationBreakdownSQL),
      ]);

      return {
        totalChanges: stats.data?.[0]?.total_changes || 0,
        successfulChanges: stats.data?.[0]?.successful_changes || 0,
        failedChanges: stats.data?.[0]?.failed_changes || 0,
        recentActivity: recentActivity.data || [],
        topUsers: topUsers.data || [],
        operationBreakdown: operationBreakdown.data || [],
      };
    } catch (error) {
      console.error("Failed to get audit stats:", error);
      return {
        totalChanges: 0,
        successfulChanges: 0,
        failedChanges: 0,
        recentActivity: [],
        topUsers: [],
        operationBreakdown: [],
      };
    }
  }, [runQuery]);

  return {
    initializeAuditTable,
    logChange,
    queryAuditLogs,
    getAuditStats,
  };
}
