import { useCallback } from "react";
import useAppStore from "@/stores/workspaceStore";
import { toast } from "sonner";

/**
 * Export format version
 */
const EXPORT_VERSION = "1.0";

/**
 * Supported entity types for partial export/import
 */
export type EntityType = "users" | "roles" | "quotas" | "row_policies" | "settings_profiles";
export type ExportScope = "all" | EntityType;

/**
 * Export data structure
 */
export interface ExportData {
  version: string;
  exportedAt: string;
  exportedBy: string;
  users?: any[];
  roles?: any[];
  quotas?: any[];
  row_policies?: any[];
  settings_profiles?: any[];
}

/**
 * Diff result showing changes between current and import
 */
export interface DiffResult {
  usersToAdd?: any[];
  usersToRemove?: any[];
  usersToUpdate?: any[];
  rolesToAdd?: any[];
  rolesToRemove?: any[];
  rolesToUpdate?: any[];
  quotasToAdd?: any[];
  quotasToRemove?: any[];
  quotasToUpdate?: any[];
}

/**
 * Hook for exporting and importing permissions
 */
export function useExportImport() {
  const { clickHouseClient, credential, userPrivileges } = useAppStore();

  /**
   * Export permissions to JSON format
   */
  const exportPermissions = useCallback(
    async (scope: ExportScope = "all"): Promise<ExportData> => {
      if (!clickHouseClient) {
        throw new Error("ClickHouse client not initialized");
      }

      const exportData: ExportData = {
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        exportedBy: credential?.username || userPrivileges?.username || "unknown",
      };

      try {
        // Export users
        if (scope === "all" || scope === "users") {
          const usersQuery = `
            SELECT
              name, id, auth_type, host_ip, host_names,
              host_names_regexp, host_names_like,
              default_roles_all, default_roles_list,
              default_database, grantees_any, grantees_list
            FROM system.users
            WHERE storage = 'local directory'
            ORDER BY name
          `;
          const usersResult = await clickHouseClient.query({ query: usersQuery });
          const usersResponse = await usersResult.json<{ data: any[] }>();
          exportData.users = usersResponse.data;
        }

        // Export roles
        if (scope === "all" || scope === "roles") {
          const rolesQuery = `
            SELECT name, id
            FROM system.roles
            WHERE storage = 'local directory'
            ORDER BY name
          `;
          const rolesResult = await clickHouseClient.query({ query: rolesQuery });
          const rolesResponse = await rolesResult.json<{ data: any[] }>();
          exportData.roles = rolesResponse.data;
        }

        // Export quotas
        if (scope === "all" || scope === "quotas") {
          const quotasQuery = `
            SELECT
              name, id, key_names, durations,
              max_queries, max_query_selects, max_query_inserts,
              max_errors, max_result_rows, max_result_bytes,
              max_read_rows, max_read_bytes, max_execution_time
            FROM system.quotas
            WHERE storage = 'local directory'
            ORDER BY name
          `;
          const quotasResult = await clickHouseClient.query({ query: quotasQuery });
          const quotasResponse = await quotasResult.json<{ data: any[] }>();
          exportData.quotas = quotasResponse.data;
        }

        // Export row policies
        if (scope === "all" || scope === "row_policies") {
          const policiesQuery = `
            SELECT
              name, short_name, database, table,
              id, source, restrictive, is_restrictive
            FROM system.row_policies
            WHERE storage = 'local directory'
            ORDER BY database, table, name
          `;
          const policiesResult = await clickHouseClient.query({ query: policiesQuery });
          const policiesResponse = await policiesResult.json<{ data: any[] }>();
          exportData.row_policies = policiesResponse.data;
        }

        // Export settings profiles
        if (scope === "all" || scope === "settings_profiles") {
          const profilesQuery = `
            SELECT name, id
            FROM system.settings_profiles
            WHERE storage = 'local directory'
            ORDER BY name
          `;
          const profilesResult = await clickHouseClient.query({ query: profilesQuery });
          const profilesResponse = await profilesResult.json<{ data: any[] }>();
          exportData.settings_profiles = profilesResponse.data;
        }

        return exportData;
      } catch (error) {
        console.error("Export failed:", error);
        throw error;
      }
    },
    [clickHouseClient, credential, userPrivileges]
  );

  /**
   * Validate import data structure and version
   */
  const validateImport = useCallback((data: any): boolean => {
    // Check required fields
    if (!data || typeof data !== "object") return false;

    // For version 1.0, exportedAt and exportedBy are optional for backwards compatibility
    if (!data.version) return false;

    // Check version compatibility
    if (data.version !== EXPORT_VERSION) {
      toast.error(`Incompatible version: ${data.version}. Expected: ${EXPORT_VERSION}`);
      return false;
    }

    // Check at least one entity type exists
    const hasEntities =
      data.users || data.roles || data.quotas || data.row_policies || data.settings_profiles;
    if (!hasEntities) {
      toast.error("Import data contains no entities");
      return false;
    }

    return true;
  }, []);

  /**
   * Calculate diff between current state and import data
   */
  const calculateDiff = useCallback((current: any, imported: any): DiffResult => {
    const diff: DiffResult = {};

    // Helper to find differences
    const findDiff = (currentList: any[] = [], importedList: any[] = []) => {
      const toAdd = importedList.filter(
        (imp) => !currentList.some((cur) => cur.name === imp.name)
      );
      const toRemove = currentList.filter(
        (cur) => !importedList.some((imp) => imp.name === cur.name)
      );
      const toUpdate = importedList.filter((imp) =>
        currentList.some((cur) => cur.name === imp.name && JSON.stringify(cur) !== JSON.stringify(imp))
      );

      return { toAdd, toRemove, toUpdate };
    };

    // Calculate diffs for each entity type
    if (imported.users) {
      const usersDiff = findDiff(current.users, imported.users);
      diff.usersToAdd = usersDiff.toAdd;
      diff.usersToRemove = usersDiff.toRemove;
      diff.usersToUpdate = usersDiff.toUpdate;
    }

    if (imported.roles) {
      const rolesDiff = findDiff(current.roles, imported.roles);
      diff.rolesToAdd = rolesDiff.toAdd;
      diff.rolesToRemove = rolesDiff.toRemove;
      diff.rolesToUpdate = rolesDiff.toUpdate;
    }

    if (imported.quotas) {
      const quotasDiff = findDiff(current.quotas, imported.quotas);
      diff.quotasToAdd = quotasDiff.toAdd;
      diff.quotasToRemove = quotasDiff.toRemove;
      diff.quotasToUpdate = quotasDiff.toUpdate;
    }

    return diff;
  }, []);

  /**
   * Import permissions (mock implementation for testing)
   */
  const importPermissions = useCallback(
    async (
      data: ExportData,
      selectedTypes: EntityType[] = ["users", "roles", "quotas", "row_policies", "settings_profiles"]
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        // Validate first
        if (!validateImport(data)) {
          return { success: false, error: "Invalid import data" };
        }

        // In actual implementation, this would:
        // 1. Calculate diff
        // 2. Generate SQL statements for changes
        // 3. Execute statements via pending changes queue

        toast.success("Import prepared successfully");
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        toast.error(`Import failed: ${message}`);
        return { success: false, error: message };
      }
    },
    [validateImport]
  );

  /**
   * Download export data as JSON file
   */
  const downloadExport = useCallback((data: ExportData, filename: string = "permissions-backup.json") => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  /**
   * Read import file
   */
  const readImportFile = useCallback(async (file: File): Promise<ExportData> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          resolve(data);
        } catch (error) {
          reject(new Error("Invalid JSON file"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }, []);

  return {
    exportPermissions,
    validateImport,
    calculateDiff,
    importPermissions,
    downloadExport,
    readImportFile,
  };
}
