import { useEffect, useState } from "react";
import type { ResponseJSON } from "@clickhouse/client-web";
import useAppStore from "@/stores/workspaceStore";
import { useAdminClient } from "@/features/admin/useAdminClient";
import { UserPrivileges } from "../types";

/**
 * Hook to check granular user privileges from ClickHouse system.grants
 *
 * Queries the user's granted privileges and derived privileges from roles
 * to determine what admin operations they can perform.
 */
export function useUserPrivileges() {
  const { isServerAvailable } = useAppStore();
  const clickHouseClient = useAdminClient();
  const [privileges, setPrivileges] = useState<UserPrivileges | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkPrivileges() {
      if (!clickHouseClient || !isServerAvailable) {
        setPrivileges(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Query all grants for current user and their roles
        const query = `
          SELECT DISTINCT access_type, grant_option
          FROM system.grants
          WHERE user_name = currentUser()
             OR role_name IN (
               SELECT granted_role_name
               FROM system.role_grants
               WHERE user_name = currentUser()
             )
        `;

        const result = await clickHouseClient.query({ query });
        const response = (await result.json()) as ResponseJSON<{
          access_type: string;
          grant_option: number;
        }>;

        // Create a set of granted access types for quick lookup
        const grantedPrivileges = new Set(
          response.data.map((row: { access_type: string; grant_option: number }) =>
            row.access_type.toUpperCase()
          )
        );

        // Check for grant option
        const hasGrantOption = response.data.some(
          (row: { access_type: string; grant_option: number }) => row.grant_option === 1
        );

        // Helper to check if user has specific privilege
        const hasPrivilege = (privilege: string): boolean => {
          return grantedPrivileges.has(privilege.toUpperCase()) ||
                 grantedPrivileges.has('ALL');
        };

        // Build privileges object
        const userPrivileges: UserPrivileges = {
          // View privileges
          canShowUsers: hasPrivilege('SHOW USERS') || hasPrivilege('SHOW ACCESS'),
          canShowRoles: hasPrivilege('SHOW ROLES') || hasPrivilege('SHOW ACCESS'),
          canShowQuotas: hasPrivilege('SHOW QUOTAS') || hasPrivilege('SHOW ACCESS'),
          canShowRowPolicies: hasPrivilege('SHOW ROW POLICIES') || hasPrivilege('SHOW ACCESS'),
          canShowSettingsProfiles: hasPrivilege('SHOW SETTINGS PROFILES') || hasPrivilege('SHOW ACCESS'),

          // User modification privileges
          canAlterUser: hasPrivilege('ALTER USER') || hasPrivilege('ACCESS MANAGEMENT'),
          canCreateUser: hasPrivilege('CREATE USER') || hasPrivilege('ACCESS MANAGEMENT'),
          canDropUser: hasPrivilege('DROP USER') || hasPrivilege('ACCESS MANAGEMENT'),

          // Role modification privileges
          canAlterRole: hasPrivilege('ALTER ROLE') || hasPrivilege('ROLE ADMIN') || hasPrivilege('ACCESS MANAGEMENT'),
          canCreateRole: hasPrivilege('CREATE ROLE') || hasPrivilege('ROLE ADMIN') || hasPrivilege('ACCESS MANAGEMENT'),
          canDropRole: hasPrivilege('DROP ROLE') || hasPrivilege('ROLE ADMIN') || hasPrivilege('ACCESS MANAGEMENT'),

          // Quota privileges
          canAlterQuota: hasPrivilege('ALTER QUOTA') || hasPrivilege('ACCESS MANAGEMENT'),
          canCreateQuota: hasPrivilege('CREATE QUOTA') || hasPrivilege('ACCESS MANAGEMENT'),
          canDropQuota: hasPrivilege('DROP QUOTA') || hasPrivilege('ACCESS MANAGEMENT'),

          // Row policy privileges
          canAlterRowPolicy: hasPrivilege('ALTER ROW POLICY') || hasPrivilege('ACCESS MANAGEMENT'),
          canCreateRowPolicy: hasPrivilege('CREATE ROW POLICY') || hasPrivilege('ACCESS MANAGEMENT'),
          canDropRowPolicy: hasPrivilege('DROP ROW POLICY') || hasPrivilege('ACCESS MANAGEMENT'),

          // Settings profile privileges
          canAlterSettingsProfile: hasPrivilege('ALTER SETTINGS PROFILE') || hasPrivilege('ACCESS MANAGEMENT'),
          canCreateSettingsProfile: hasPrivilege('CREATE SETTINGS PROFILE') || hasPrivilege('ACCESS MANAGEMENT'),
          canDropSettingsProfile: hasPrivilege('DROP SETTINGS PROFILE') || hasPrivilege('ACCESS MANAGEMENT'),

          // Grant option
          hasGrantOption,
        };

        setPrivileges(userPrivileges);
      } catch (err) {
        console.error("Failed to check user privileges:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setPrivileges(null);
      } finally {
        setIsLoading(false);
      }
    }

    checkPrivileges();
  }, [clickHouseClient, isServerAvailable]);

  return { privileges, isLoading, error };
}
