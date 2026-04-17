import { useState, useEffect } from "react";
import useAppStore from "@/stores/workspaceStore";

interface UserSettings {
  profile?: string;
  readonly: boolean;
}

interface UserInfo {
  name: string;
  auth_type: string[];
  host_ip: string[];
  host_names: string[];
  host_names_regexp: string[];
  host_names_like: string[];
  default_roles_all: number;
  default_roles_list: string[];
  default_database: string | null;
  grantees_any: number;
  settings?: UserSettings;
}

interface UseUserDataOptions {
  username?: string;
}

/**
 * Hook to fetch complete user data for editing
 * @param username - Username to fetch data for
 * @returns User info, loading state, and error
 */
export function useUserData({ username }: UseUserDataOptions) {
  const { runQuery } = useAppStore();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUserData() {
      if (!username) {
        setUserInfo(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Fetch user info from system.users
        const userResult = await runQuery(`
          SELECT
            name,
            auth_type,
            host_ip,
            host_names,
            host_names_regexp,
            host_names_like,
            default_roles_all,
            default_roles_list,
            default_database,
            grantees_any
          FROM system.users
          WHERE name = '${username}'
        `);

        if (userResult.error) {
          throw new Error(userResult.error);
        }

        if (!userResult.data || userResult.data.length === 0) {
          throw new Error(`User ${username} not found`);
        }

        const userData = userResult.data[0];

        // Fetch settings from SHOW CREATE USER
        const settingsResult = await runQuery(`SHOW CREATE USER ${username}`);
        const createStatement = settingsResult.data?.[0]?.statement || "";

        const settings: UserSettings = {
          profile: (createStatement.match(/SETTINGS PROFILE '([^']+)'/) || [])[1],
          readonly: createStatement.includes("READONLY=1") || createStatement.includes("READONLY = 1"),
        };

        setUserInfo({
          ...userData,
          settings,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch user data";
        setError(errorMessage);
        console.error("Error fetching user data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchUserData();
  }, [username, runQuery]);

  return { userInfo, loading, error };
}
