import React, { useEffect, useState } from "react";
import { ConfirmationDialog, ImpactItem } from "@/components/ConfirmationDialog";
import useAppStore from "@/stores/workspaceStore";
import type { ResponseJSON } from "@clickhouse/client-web";

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: string | null;
  onDeleteUser: (username: string) => void;
  deleting: boolean;
}

/**
 * Enhanced delete user dialog with safety features:
 * - Requires typing username for confirmation
 * - Shows impact preview (grants, roles, etc. that will be removed)
 * - Displays undo information
 * - Keyboard navigation support
 */
const DeleteUserDialog: React.FC<DeleteUserDialogProps> = ({
  open,
  onOpenChange,
  selectedUser,
  onDeleteUser,
  deleting,
}) => {
  const { clickHouseClient } = useAppStore();
  const [impactItems, setImpactItems] = useState<ImpactItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch impact preview when dialog opens
  useEffect(() => {
    async function fetchImpact() {
      if (!open || !selectedUser || !clickHouseClient) {
        setImpactItems([]);
        return;
      }

      setLoading(true);
      try {
        // Fetch grants for the user
        const grantsQuery = `
          SELECT COUNT(*) as grant_count
          FROM system.grants
          WHERE user_name = {username:String}
        `;

        const grantsResult = await clickHouseClient.query({
          query: grantsQuery,
          query_params: { username: selectedUser },
        });

        const grantsData = (await grantsResult.json()) as ResponseJSON<{ grant_count: string }>;
        const grantCount = parseInt(grantsData.data[0]?.grant_count || "0");

        // Fetch role grants
        const roleGrantsQuery = `
          SELECT COUNT(*) as role_count
          FROM system.role_grants
          WHERE user_name = {username:String}
        `;

        const roleGrantsResult = await clickHouseClient.query({
          query: roleGrantsQuery,
          query_params: { username: selectedUser },
        });

        const roleGrantsData = (await roleGrantsResult.json()) as ResponseJSON<{ role_count: string }>;
        const roleCount = parseInt(roleGrantsData.data[0]?.role_count || "0");

        const items: ImpactItem[] = [];

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
        setLoading(false);
      }
    }

    fetchImpact();
  }, [open, selectedUser, clickHouseClient]);

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete User"
      description={`You are about to permanently delete the user "${selectedUser}". This action cannot be undone.`}
      confirmText="Delete User"
      cancelText="Cancel"
      variant="destructive"
      onConfirm={() => {
        if (selectedUser) {
          onDeleteUser(selectedUser);
        }
      }}
      isLoading={deleting || loading}
      requiresTypedConfirmation={true}
      entityName={selectedUser || ""}
      impactPreview={impactItems}
      undoInfo="To restore this user, you will need to recreate it manually with all grants and role assignments."
    />
  );
};

export default DeleteUserDialog;
