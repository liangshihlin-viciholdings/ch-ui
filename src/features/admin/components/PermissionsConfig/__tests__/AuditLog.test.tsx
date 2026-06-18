import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { useAuditLog } from "../hooks/useAuditLog";
import { PendingChange, ChangeExecutionResult } from "../types";

// Mock the store
vi.mock("@/stores/workspaceStore", () => ({
  default: vi.fn(() => ({
    runQuery: vi.fn(),
    credential: { username: "test_user" },
    userPrivileges: { username: "test_user" },
  })),
}));

// Mock toast
vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("Audit Logging System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useAuditLog Hook", () => {
    it("should initialize audit table with correct schema", async () => {
      const useAppStore = await import("@/stores/workspaceStore");
      const mockRunQuery = vi.fn().mockResolvedValue({ rows: [] });
      (useAppStore.default as any).mockReturnValue({
        runQuery: mockRunQuery,
        credential: { username: "test_user" },
      });

      const TestComponent = () => {
        const { initializeAuditTable } = useAuditLog();
        return <button onClick={() => initializeAuditTable()}>Initialize</button>;
      };

      render(<TestComponent />);
      const button = screen.getByText("Initialize");
      await userEvent.click(button);

      await waitFor(() => {
        expect(mockRunQuery).toHaveBeenCalled();
      });

      // Verify the CREATE TABLE statement
      const createTableCall = mockRunQuery.mock.calls.find((call) =>
        call[0].includes("CREATE TABLE IF NOT EXISTS deebee_audit_log")
      );
      expect(createTableCall).toBeDefined();

      const sql = createTableCall![0];
      expect(sql).toContain("id String");
      expect(sql).toContain("timestamp DateTime64(3)");
      expect(sql).toContain("username String");
      expect(sql).toContain("operation String");
      expect(sql).toContain("entity_type String");
      expect(sql).toContain("entity_name String");
      expect(sql).toContain("sql_statements Array(String)");
      expect(sql).toContain("success UInt8");
      expect(sql).toContain("TTL timestamp + INTERVAL 90 DAY");
    });

    it("should log successful permission change", async () => {
      const useAppStore = await import("@/stores/workspaceStore");
      const mockRunQuery = vi.fn().mockResolvedValue({ rows: [] });
      (useAppStore.default as any).mockReturnValue({
        runQuery: mockRunQuery,
        clickHouseClient: { query: mockRunQuery },
        credential: { username: "admin_user" },
      });

      const TestComponent = () => {
        const { logChange } = useAuditLog();

        const handleLog = async () => {
          const change: PendingChange = {
            id: "test-change-1",
            type: "GRANT",
            entityType: "USER",
            entityName: "test_user",
            description: "Grant SELECT privilege to test_user",
            sqlStatements: ["GRANT SELECT ON *.* TO test_user"],
            createdAt: Date.now(),
          };

          const result: ChangeExecutionResult = {
            changeId: "test-change-1",
            success: true,
          };

          await logChange(change, result, "admin_user");
        };

        return <button onClick={handleLog}>Log Change</button>;
      };

      render(<TestComponent />);
      const button = screen.getByText("Log Change");
      await userEvent.click(button);

      await waitFor(() => {
        expect(mockRunQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.stringContaining("INSERT INTO deebee_audit_log"),
            query_params: expect.objectContaining({
              username: "admin_user",
              operation: "GRANT",
              entityType: "USER",
              entityName: "test_user",
              success: 1,
            }),
          })
        );
      });
    });

    it("should log failed permission change with error", async () => {
      const useAppStore = await import("@/stores/workspaceStore");
      const mockRunQuery = vi.fn().mockResolvedValue({ rows: [] });
      (useAppStore.default as any).mockReturnValue({
        runQuery: mockRunQuery,
        clickHouseClient: { query: mockRunQuery },
        credential: { username: "admin_user" },
      });

      const TestComponent = () => {
        const { logChange } = useAuditLog();

        const handleLog = async () => {
          const change: PendingChange = {
            id: "test-change-2",
            type: "DROP",
            entityType: "USER",
            entityName: "readonly_user",
            description: "Drop readonly_user",
            sqlStatements: ["DROP USER readonly_user"],
            createdAt: Date.now(),
          };

          const result: ChangeExecutionResult = {
            changeId: "test-change-2",
            success: false,
            error: "DB::Exception: User is protected",
          };

          await logChange(change, result, "admin_user");
        };

        return <button onClick={handleLog}>Log Failure</button>;
      };

      render(<TestComponent />);
      const button = screen.getByText("Log Failure");
      await userEvent.click(button);

      await waitFor(() => {
        expect(mockRunQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.stringContaining("INSERT INTO deebee_audit_log"),
            query_params: expect.objectContaining({
              success: 0,
              errorMessage: "DB::Exception: User is protected",
            }),
          })
        );
      });
    });

    it("should query audit logs with filters", async () => {
      const useAppStore = await import("@/stores/workspaceStore");
      const auditRow = {
        id: "audit-1",
        timestamp: "2024-01-30 10:00:00",
        username: "admin",
        operation: "GRANT",
        entity_type: "USER",
        entity_name: "test_user",
        description: "Grant SELECT",
        sql_statements: ["GRANT SELECT ON *.* TO test_user"],
        before_state: "{}",
        after_state: "{}",
        success: 1,
        error_message: "",
        client_ip: "",
        session_id: "",
      };
      const mockRunQuery = vi
        .fn()
        .mockResolvedValue({ json: async () => ({ data: [auditRow] }) });
      (useAppStore.default as any).mockReturnValue({
        runQuery: mockRunQuery,
        clickHouseClient: { query: mockRunQuery },
        credential: { username: "admin" },
      });

      const TestComponent = () => {
        const { queryAuditLogs } = useAuditLog();

        const handleQuery = async () => {
          await queryAuditLogs({
            username: "admin",
            operation: "GRANT",
            limit: 10,
          });
        };

        return <button onClick={handleQuery}>Query Logs</button>;
      };

      render(<TestComponent />);
      const button = screen.getByText("Query Logs");
      await userEvent.click(button);

      await waitFor(() => {
        expect(mockRunQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.stringContaining("SELECT"),
            query_params: expect.objectContaining({
              username: "admin",
              operation: "GRANT",
              limit: 10,
            }),
          })
        );
      });
    });

    it("should get audit statistics", async () => {
      const useAppStore = await import("@/stores/workspaceStore");
      const mockRunQuery = vi
        .fn()
        .mockResolvedValueOnce({
          data: [{ total_changes: 100, successful_changes: 95, failed_changes: 5 }],
        })
        .mockResolvedValueOnce({
          data: [
            { date: "2024-01-30", count: 25 },
            { date: "2024-01-29", count: 30 },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { username: "admin", count: 50 },
            { username: "operator", count: 30 },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            { operation: "GRANT", count: 40 },
            { operation: "REVOKE", count: 20 },
          ],
        });

      (useAppStore.default as any).mockReturnValue({
        runQuery: mockRunQuery,
        credential: { username: "admin" },
      });

      const TestComponent = () => {
        const { getAuditStats } = useAuditLog();
        const [stats, setStats] = React.useState<any>(null);

        const handleGetStats = async () => {
          const result = await getAuditStats();
          setStats(result);
        };

        return (
          <div>
            <button onClick={handleGetStats}>Get Stats</button>
            {stats && (
              <div>
                <div data-testid="total">{stats.totalChanges}</div>
                <div data-testid="successful">{stats.successfulChanges}</div>
                <div data-testid="failed">{stats.failedChanges}</div>
              </div>
            )}
          </div>
        );
      };

      render(<TestComponent />);
      const button = screen.getByText("Get Stats");
      await userEvent.click(button);

      await waitFor(() => {
        expect(screen.getByTestId("total")).toHaveTextContent("100");
        expect(screen.getByTestId("successful")).toHaveTextContent("95");
        expect(screen.getByTestId("failed")).toHaveTextContent("5");
      });

      // Verify multiple queries were made
      expect(mockRunQuery).toHaveBeenCalledTimes(4);
    });
  });

  describe("Audit Log Data Retention", () => {
    it("should include 90-day TTL in table schema", async () => {
      const useAppStore = await import("@/stores/workspaceStore");
      const mockRunQuery = vi.fn().mockResolvedValue({ rows: [] });
      (useAppStore.default as any).mockReturnValue({
        runQuery: mockRunQuery,
        clickHouseClient: { query: mockRunQuery },
        credential: { username: "admin" },
      });

      const TestComponent = () => {
        const { initializeAuditTable } = useAuditLog();
        return <button onClick={() => initializeAuditTable()}>Initialize</button>;
      };

      render(<TestComponent />);
      const button = screen.getByText("Initialize");
      await userEvent.click(button);

      await waitFor(() => {
        const createTableCall = mockRunQuery.mock.calls.find((call) =>
          call[0].includes("CREATE TABLE")
        );
        expect(createTableCall![0]).toContain("TTL timestamp + INTERVAL 90 DAY");
      });
    });
  });

  describe("Audit Log State Tracking", () => {
    it("should include before and after state in audit entry", async () => {
      const useAppStore = await import("@/stores/workspaceStore");
      const mockRunQuery = vi.fn().mockResolvedValue({ rows: [] });
      (useAppStore.default as any).mockReturnValue({
        runQuery: mockRunQuery,
        clickHouseClient: { query: mockRunQuery },
        credential: { username: "admin" },
      });

      const TestComponent = () => {
        const { logChange } = useAuditLog();

        const handleLog = async () => {
          const change: PendingChange = {
            id: "test-change-3",
            type: "ALTER",
            entityType: "USER",
            entityName: "test_user",
            description: "Change user settings",
            sqlStatements: ["ALTER USER test_user SETTINGS max_memory_usage = 10000000000"],
            originalState: { max_memory_usage: 5000000000 },
            newState: { max_memory_usage: 10000000000 },
            createdAt: Date.now(),
          };

          const result: ChangeExecutionResult = {
            changeId: "test-change-3",
            success: true,
          };

          await logChange(change, result, "admin");
        };

        return <button onClick={handleLog}>Log State Change</button>;
      };

      render(<TestComponent />);
      const button = screen.getByText("Log State Change");
      await userEvent.click(button);

      await waitFor(() => {
        expect(mockRunQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.stringContaining("INSERT INTO deebee_audit_log"),
            query_params: expect.objectContaining({
              beforeState: JSON.stringify({ max_memory_usage: 5000000000 }),
              afterState: JSON.stringify({ max_memory_usage: 10000000000 }),
            }),
          })
        );
      });
    });
  });

  describe("Audit Log Partitioning", () => {
    it("should partition by month in table schema", async () => {
      const useAppStore = await import("@/stores/workspaceStore");
      const mockRunQuery = vi.fn().mockResolvedValue({ rows: [] });
      (useAppStore.default as any).mockReturnValue({
        runQuery: mockRunQuery,
        clickHouseClient: { query: mockRunQuery },
        credential: { username: "admin" },
      });

      const TestComponent = () => {
        const { initializeAuditTable } = useAuditLog();
        return <button onClick={() => initializeAuditTable()}>Initialize</button>;
      };

      render(<TestComponent />);
      const button = screen.getByText("Initialize");
      await userEvent.click(button);

      await waitFor(() => {
        const createTableCall = mockRunQuery.mock.calls.find((call) =>
          call[0].includes("CREATE TABLE")
        );
        expect(createTableCall![0]).toContain("PARTITION BY toYYYYMM(timestamp)");
      });
    });
  });
});
