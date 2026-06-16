import { useState, useEffect } from "react";
import type { ResponseJSON } from "@clickhouse/client-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Plus, Edit, Trash2, Users } from "lucide-react";
import useAppStore from "@/stores/workspaceStore";
import { useAdminClient } from "@/features/admin/useAdminClient";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import RoleEditor from "./RoleEditor";
import { ListSkeleton } from "../LoadingSkeletons/ListSkeleton";

interface RoleData {
  name: string;
  id: string;
}

interface RolesLayerProps {
  onAddChange: (change: any) => void;
}

export default function RolesLayer({ onAddChange }: RolesLayerProps) {
  const { userPrivileges } = useAppStore();
  const clickHouseClient = useAdminClient();
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState<RoleData | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const canEdit = userPrivileges?.canAlterRole || userPrivileges?.hasGrantOption;
  const canCreate = userPrivileges?.canCreateRole;
  const canDelete = userPrivileges?.canDropRole;

  // Fetch roles from ClickHouse
  useEffect(() => {
    async function fetchRoles() {
      if (!clickHouseClient) return;

      setLoading(true);
      try {
        const query = `
          SELECT
            name,
            id
          FROM system.roles
          ORDER BY name
        `;

        const result = await clickHouseClient.query({ query });
        const response = (await result.json()) as ResponseJSON<RoleData>;

        setRoles(response.data);
      } catch (error) {
        console.error("Failed to fetch roles:", error);
        toast.error("Failed to fetch roles");
      } finally {
        setLoading(false);
      }
    }

    fetchRoles();
  }, [clickHouseClient]);

  // Filter roles based on search term
  const filteredRoles = roles.filter((role) =>
    role.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEditRole = (role: RoleData) => {
    setSelectedRole(role);
    setIsEditorOpen(true);
  };

  const handleCreateRole = () => {
    setSelectedRole(null);
    setIsEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setSelectedRole(null);
  };

  const handleDeleteRole = (role: RoleData) => {
    // Stage deletion change
    onAddChange({
      type: "DROP",
      entityType: "ROLE",
      entityName: role.name,
      description: `Delete role ${role.name}`,
      sqlStatements: [`DROP ROLE ${role.name}`],
      originalState: { role },
      newState: null,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Roles Management</h3>
          <p className="text-sm text-muted-foreground">
            Create and configure roles with specific permission sets
          </p>
        </div>
        {canCreate && (
          <Button onClick={handleCreateRole} className="gap-2" disabled={loading}>
            <Plus className="w-4 h-4" />
            Create Role
          </Button>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search roles..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
          disabled={loading}
        />
      </div>

      {/* Roles table */}
      {loading ? (
        <Card>
          <ListSkeleton rows={4} columns={3} />
        </Card>
      ) : filteredRoles.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchTerm ? "No roles found" : "No roles available"}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role Name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRoles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">{role.name}</TableCell>
                  <TableCell>
                    <code className="text-xs text-muted-foreground">{role.id}</code>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditRole(role)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRole(role)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Role editor dialog */}
      {isEditorOpen && (
        <RoleEditor
          role={selectedRole}
          onClose={handleCloseEditor}
          onAddChange={onAddChange}
        />
      )}
    </div>
  );
}
