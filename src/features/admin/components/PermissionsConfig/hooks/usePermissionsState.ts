import { useState, useCallback, useEffect } from "react";
import {
  PendingChange,
  PermissionsState,
  PermissionsActions,
  ChangeExecutionResult,
  LayerType,
} from "../types";
import useAppStore from "@/stores/workspaceStore";
import { useAuditLog } from "./useAuditLog";
import { useEnhancedToast } from "./useEnhancedToast";

/**
 * Hook to manage permissions configuration state
 * Handles pending changes queue and execution
 */
export function usePermissionsState(): PermissionsState & PermissionsActions {
  const { runQuery, credential, userPrivileges } = useAppStore();
  const { initializeAuditTable, logChange } = useAuditLog();
  const toast = useEnhancedToast();
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [activeLayer, setActiveLayer] = useState<LayerType>("users");
  const [isReviewPanelOpen, setIsReviewPanelOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResults, setExecutionResults] = useState<ChangeExecutionResult[]>([]);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [currentExecutingChange, setCurrentExecutingChange] = useState<PendingChange | null>(null);

  /**
   * Initialize audit log table on mount
   */
  useEffect(() => {
    initializeAuditTable();
  }, [initializeAuditTable]);

  /**
   * Add a pending change to the queue
   */
  const addPendingChange = useCallback(
    (change: Omit<PendingChange, "id" | "createdAt">) => {
      const newChange: PendingChange = {
        ...change,
        id: `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
      };

      setPendingChanges((prev) => [...prev, newChange]);
      toast.info(`Change staged: ${change.description}`, {
        details: `${change.type} on ${change.entityType}: ${change.entityName}`,
      });
    },
    [toast]
  );

  /**
   * Remove a pending change from the queue
   */
  const removePendingChange = useCallback(
    (changeId: string) => {
      const removedChange = pendingChanges.find((c) => c.id === changeId);
      setPendingChanges((prev) => prev.filter((c) => c.id !== changeId));

      if (removedChange) {
        toast.info("Change removed from queue", {
          details: removedChange.description,
          showUndo: true,
          onUndo: () => {
            setPendingChanges((prev) => [...prev, removedChange]);
          },
        });
      }
    },
    [pendingChanges, toast]
  );

  /**
   * Clear all pending changes
   */
  const clearPendingChanges = useCallback(() => {
    const clearedChanges = [...pendingChanges];
    setPendingChanges([]);
    setExecutionResults([]);

    toast.info(`${clearedChanges.length} change(s) cleared`, {
      showUndo: clearedChanges.length > 0,
      onUndo: () => {
        setPendingChanges(clearedChanges);
      },
    });
  }, [pendingChanges, toast]);

  /**
   * Toggle the review panel
   */
  const toggleReviewPanel = useCallback(() => {
    setIsReviewPanelOpen((prev) => !prev);
  }, []);

  /**
   * Execute a single change
   */
  const executeChange = useCallback(
    async (changeId: string): Promise<ChangeExecutionResult> => {
      const change = pendingChanges.find((c) => c.id === changeId);
      if (!change) {
        return {
          changeId,
          success: false,
          error: "Change not found",
        };
      }

      let result: ChangeExecutionResult;

      try {
        // Execute all SQL statements for this change
        for (const sql of change.sqlStatements) {
          await runQuery(sql);
        }

        result = {
          changeId,
          success: true,
        };
      } catch (error) {
        result = {
          changeId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }

      // Log to audit table (don't await - fire and forget)
      const username = credential?.username || userPrivileges?.username || "unknown";
      logChange(change, result, username).catch((err) => {
        console.error("Failed to log change to audit:", err);
      });

      return result;
    },
    [pendingChanges, runQuery, credential, userPrivileges, logChange]
  );

  /**
   * Execute all pending changes
   */
  const executePendingChanges = useCallback(async (): Promise<
    ChangeExecutionResult[]
  > => {
    if (pendingChanges.length === 0) {
      toast.warning("No pending changes to execute");
      return [];
    }

    setIsExecuting(true);
    setExecutionResults([]);
    setExecutionProgress(0);
    setCurrentExecutingChange(null);

    const results: ChangeExecutionResult[] = [];
    const loadingToast = toast.loading(
      `Executing ${pendingChanges.length} change(s)...`,
      {
        details: "Please wait while changes are applied",
      }
    );

    try {
      // Execute changes sequentially
      for (let i = 0; i < pendingChanges.length; i++) {
        const change = pendingChanges[i];
        setExecutionProgress(i + 1);
        setCurrentExecutingChange(change);

        const result = await executeChange(change.id);
        results.push(result);

        if (!result.success) {
          // Stop on first error
          loadingToast.dismiss();
          toast.error(`Failed to execute change`, {
            details: `${change.description}\nError: ${result.error}`,
          });
          break;
        }
      }

      setExecutionResults(results);

      // Check if all succeeded
      const allSucceeded = results.every((r) => r.success);
      if (allSucceeded) {
        loadingToast.dismiss();

        const executedChanges = [...pendingChanges];
        toast.success(`Successfully executed ${results.length} change(s)`, {
          details: executedChanges.map((c) => c.description).join("\n"),
        });

        // Clear pending changes on success
        setPendingChanges([]);
        setIsReviewPanelOpen(false);
      } else {
        loadingToast.dismiss();
        const successCount = results.filter((r) => r.success).length;
        toast.warning(`Partial execution completed`, {
          details: `${successCount} of ${pendingChanges.length} changes succeeded. Some failed.`,
        });
        // Remove only the successful changes
        const successfulIds = results
          .filter((r) => r.success)
          .map((r) => r.changeId);
        setPendingChanges((prev) =>
          prev.filter((c) => !successfulIds.includes(c.id))
        );
      }

      return results;
    } catch (error) {
      loadingToast.dismiss();
      toast.error("Error during execution", {
        details: error instanceof Error ? error.message : "Unknown error",
      });
      setExecutionResults(results);
      return results;
    } finally {
      setIsExecuting(false);
      setExecutionProgress(0);
      setCurrentExecutingChange(null);
    }
  }, [pendingChanges, executeChange, toast]);

  return {
    // State
    pendingChanges,
    activeLayer,
    isReviewPanelOpen,
    isExecuting,
    executionResults,
    executionProgress,
    currentExecutingChange,
    // Actions
    addPendingChange,
    removePendingChange,
    clearPendingChanges,
    setActiveLayer,
    toggleReviewPanel,
    executePendingChanges,
    executeChange,
  };
}
