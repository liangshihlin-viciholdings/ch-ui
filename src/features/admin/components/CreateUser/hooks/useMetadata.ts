// hooks/useMetadata.ts
import { useState, useEffect } from "react";
import useAppStore from "@/stores/workspaceStore";
import { toast } from "sonner";

interface Metadata {
  roles: string[];
  databases: string[];
  profiles: string[];
  tables: Map<string, string[]>;
}

const useMetadata = (isOpen: boolean): Metadata => {
  const { runQuery } = useAppStore();
  const [metadata, setMetadata] = useState<Metadata>({
    roles: [],
    databases: [],
    profiles: [],
    tables: new Map(),
  });

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const rolesResult = await runQuery("SHOW ROLES");
        const roles = !rolesResult.error && rolesResult.data
          ? rolesResult.data.map((row: any) => row.name)
          : [];

        const dbResult = await runQuery("SHOW DATABASES");
        const databases = !dbResult.error && dbResult.data
          ? dbResult.data.map((row: any) => row.name)
          : [];

        const profilesResult = await runQuery("SHOW SETTINGS PROFILES");
        const profiles = !profilesResult.error && profilesResult.data
          ? profilesResult.data.map((row: any) => row.name)
          : [];

        // Fetch tables for each database
        const tables = new Map<string, string[]>();
        for (const db of databases) {
          // Skip system databases for cleaner UI
          if (db === "system" || db === "information_schema" || db === "INFORMATION_SCHEMA") {
            continue;
          }
          try {
            const tablesResult = await runQuery(`SHOW TABLES FROM ${db}`);
            if (!tablesResult.error && tablesResult.data) {
              tables.set(db, tablesResult.data.map((row: any) => row.name));
            }
          } catch {
            // Skip databases we can't access
          }
        }

        setMetadata({ roles, databases, profiles, tables });
      } catch (err) {
        console.error("Failed to fetch metadata:", err);
        toast.error("Failed to fetch metadata.");
      }
    };

    if (isOpen) {
      fetchMetadata();
    }
  }, [isOpen, runQuery]);

  return metadata;
};

export default useMetadata;
