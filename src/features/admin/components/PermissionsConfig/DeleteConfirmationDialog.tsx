import { useEffect, useState } from "react";
import { ConfirmationDialog, ImpactItem } from "@/components/ConfirmationDialog";
import useAppStore from "@/stores/workspaceStore";

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: "user" | "role" | "quota" | "row_policy" | "settings_profile";
  entityName: string | null;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}

/**
 * Reusable delete confirmation dialog for all permissions entities
 *
 * Features:
 * - Entity-specific impact preview
 * - Requires typing entity name for critical operations
 * - Displays undo information
 * - Keyboard navigation support
 */
export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  entityType,
  entityName,
  onConfirm,
  isLoading = false,
}: DeleteConfirmationDialogProps) {
  const { clickHouseClient } = useAppStore();
  const [impactItems, setImpactItems] = useState<ImpactItem[]>([]);
  const [loadingImpact, setLoadingImpact] = useState(false);

  // Fetch impact preview when dialog opens
  useEffect(() => {
    async function fetchImpact() {
      if (!open || !entityName || !clickHouseClient) {
        setImpactItems([]);
        return;
      }

      setLoadingImpact(true);
      try {
        const items: ImpactItem[] = [];

        switch (entityType) {
          case "user": {
            // Fetch grants for the user
            const grantsQuery = `
              SELECT COUNT(*) as grant_count
              FROM system.grants
              WHERE user_name = {name:String}
            `;

            const grantsResult = await clickHouseClient.query({
              query: grantsQuery,
              query_params: { name: entityName },
            });

            const grantsData = await grantsResult.json<{ data: Array<{ grant_count: string }> }>();
            const grantCount = parseInt(grantsData.data[0]?.grant_count || "0");

            // Fetch role grants
            const roleGrantsQuery = `
              SELECT COUNT(*) as role_count
              FROM system.role_grants
              WHERE user_name = {name:String}
            `;

            const roleGrantsResult = await clickHouseClient.query({
              query: roleGrantsQuery,
              query_params: { name: entityName },
            });

            const roleGrantsData = await roleGrantsResult.json<{ data: Array<{ role_count: string }> }>();
            const roleCount = parseInt(roleGrantsData.data[0]?.role_count || "0");

            if (grantCount > 0) {
              items.push({
                type: "warning",
                message: `${grantCount} grant(s) will be revoked`,
              });
            }

            if (roleCount > 0) {
              items.push({
                type: "warning",
                message: `${roleCount} role assignment(s) will be removed`,
              });
            }

            if (items.length === 0) {
              items.push({
                type: "info",
                message: "User has no grants or role assignments",
              });
            }
            break;
          }

          case "role": {
            // Fetch users assigned to this role
            const roleUsersQuery = `
              SELECT COUNT(*) as user_count
              FROM system.role_grants
              WHERE granted_role_name = {name:String}
            `;

            const roleUsersResult = await clickHouseClient.query({
              query: roleUsersQuery,
              query_params: { name: entityName },
            });

            const roleUsersData = await roleUsersResult.json<{ data: Array<{ user_count: string }> }>();
            const userCount = parseInt(roleUsersData.data[0]?.user_count || "0");

            if (userCount > 0) {
              items.push({
                type: "warning",
                message: `${userCount} user(s) have this role assigned`,
              });
            } else {
              items.push({
                type: "info",
                message: "Role is not assigned to any users",
              });
            }
            break;
          }

          case "quota": {
            // Fetch users assigned to this quota
            const quotaUsersQuery = `
              SELECT COUNT(*) as user_count
              FROM system.quota_usage
              WHERE quota_name = {name:String}
            `;

            const quotaUsersResult = await clickHouseClient.query({
              query: quotaUsersQuery,
              query_params: { name: entityName },
            });

            const quotaUsersData = await quotaUsersResult.json<{ data: Array<{ user_count: string }> }>();
            const userCount = parseInt(quotaUsersData.data[0]?.user_count || "0");

            if (userCount > 0) {
              items.push({
                type: "warning",
                message: `${userCount} user(s) are using this quota`,
              });
            } else {
              items.push({
                type: "info",
                message: "Quota is not assigned to any users",
              });
            }
            break;
          }

          case "row_policy": {
            items.push({
              type: "warning",
              message: "All row-level filters for this policy will be removed",
            });
            break;
          }

          case "settings_profile": {
            items.push({
              type: "warning",
              message: "All custom settings in this profile will be lost",
            });
            break;
          }
        }

        setImpactItems(items);
      } catch (error) {
        console.error("Failed to fetch impact preview:", error);
        setImpactItems([
          {
            type: "info",
            message: "Unable to fetch impact preview",
          },
        ]);
      } finally {
        setLoadingImpact(false);
      }
    }

    fetchImpact();
  }, [open, entityName, entityType, clickHouseClient]);

  const entityTypeLabels = {
    user: "User",
    role: "Role",
    quota: "Quota",
    row_policy: "Row Policy",
    settings_profile: "Settings Profile",
  };

  const undoMessages = {
    user: "To restore this user, you will need to recreate it manually with all grants and role assignments.",
    role: "To restore this role, you will need to recreate it manually with all grants and user assignments.",
    quota: "To restore this quota, you will need to recreate it manually with all limits and user assignments.",
    row_policy: "To restore this row policy, you will need to recreate it manually with all filter conditions.",
    settings_profile: "To restore this settings profile, you will need to recreate it manually with all custom settings.",
  };

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${entityTypeLabels[entityType]}`}
      description={`You are about to permanently delete the ${entityType.replace("_", " ")} "${entityName}". This action cannot be undone.`}
      confirmText={`Delete ${entityTypeLabels[entityType]}`}
      cancelText="Cancel"
      variant="destructive"
      onConfirm={onConfirm}
      isLoading={isLoading || loadingImpact}
      requiresTypedConfirmation={true}
      entityName={entityName || ""}
      impactPreview={impactItems}
      undoInfo={undoMessages[entityType]}
    />
  );
}
