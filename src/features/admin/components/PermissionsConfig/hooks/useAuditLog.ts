import { useCallback } from "react";
import type { ResponseJSON } from "@clickhouse/client-web";
import useAppStore from "@/stores/workspaceStore";
import { useAdminClient } from "@/features/admin/useAdminClient";
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
  const { runQuery } = useAppStore();
  const clickHouseClient = useAdminClient();

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
   * Log a permission change to the audit table using parameterized queries
   */
  const logChange = useCallback(
    async (
      change: PendingChange,
      result: ChangeExecutionResult,
      username: string
    ): Promise<void> => {
      if (!clickHouseClient) {
        console.error("ClickHouse client not available for audit logging");
        return;
      }

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
          clientIp: "",
          sessionId: "",
        };

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
            {id:String},
            {timestamp:String},
            {username:String},
            {operation:String},
            {entityType:String},
            {entityName:String},
            {description:String},
            {sqlStatements:Array(String)},
            {beforeState:String},
            {afterState:String},
            {success:UInt8},
            {errorMessage:String},
            {clientIp:String},
            {sessionId:String}
          )
        `;

        await clickHouseClient.query({
          query: insertSQL,
          query_params: {
            id: entry.id,
            timestamp: entry.timestamp.toISOString(),
            username: entry.username,
            operation: entry.operation,
            entityType: entry.entityType,
            entityName: entry.entityName,
            description: entry.description,
            sqlStatements: entry.sqlStatements,
            beforeState: JSON.stringify(entry.beforeState || {}),
            afterState: JSON.stringify(entry.afterState || {}),
            success: entry.success ? 1 : 0,
            errorMessage: entry.errorMessage || "",
            clientIp: entry.clientIp || "",
            sessionId: entry.sessionId || "",
          },
        });
      } catch (error) {
        // Don't throw - logging failure shouldn't break the main operation
        console.error("Failed to log audit entry:", error);
      }
    },
    [clickHouseClient]
  );

  /**
   * Query audit logs with filters using parameterized queries
   */
  const queryAuditLogs = useCallback(
    async (filters: AuditLogFilters = {}): Promise<AuditLogEntry[]> => {
      if (!clickHouseClient) {
        console.error("ClickHouse client not available");
        return [];
      }

      try {
        const whereClauses: string[] = ["1=1"];
        const queryParams: Record<string, string | number> = {};

        if (filters.username) {
          whereClauses.push("username = {username:String}");
          queryParams.username = filters.username;
        }

        if (filters.operation) {
          whereClauses.push("operation = {operation:String}");
          queryParams.operation = filters.operation;
        }

        if (filters.entityType) {
          whereClauses.push("entity_type = {entityType:String}");
          queryParams.entityType = filters.entityType;
        }

        if (filters.success !== undefined) {
          whereClauses.push("success = {success:UInt8}");
          queryParams.success = filters.success ? 1 : 0;
        }

        if (filters.startDate) {
          whereClauses.push("timestamp >= {startDate:String}");
          queryParams.startDate = filters.startDate.toISOString();
        }

        if (filters.endDate) {
          whereClauses.push("timestamp <= {endDate:String}");
          queryParams.endDate = filters.endDate.toISOString();
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
          WHERE ${whereClauses.join(" AND ")}
          ORDER BY timestamp DESC
          LIMIT {limit:UInt32}
          OFFSET {offset:UInt32}
        `;

        queryParams.limit = limit;
        queryParams.offset = offset;

        const result = await clickHouseClient.query({
          query: querySQL,
          query_params: queryParams,
        });

        interface AuditLogRow {
          id: string;
          timestamp: string;
          username: string;
          operation: string;
          entity_type: string;
          entity_name: string;
          description: string;
          sql_statements: string[];
          before_state: string;
          after_state: string;
          success: number;
          error_message: string;
          client_ip: string;
          session_id: string;
        }

        const response = (await result.json()) as ResponseJSON<AuditLogRow>;
        const entries: AuditLogEntry[] = (response.data || []).map((row) => ({
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
    [clickHouseClient]
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
