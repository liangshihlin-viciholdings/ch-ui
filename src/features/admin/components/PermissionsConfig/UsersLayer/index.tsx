import { useState, useEffect } from "react";
import type { ResponseJSON } from "@clickhouse/client-web";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UserPlus, Edit, Trash2 } from "lucide-react";
import useAppStore from "@/stores/workspaceStore";
import { UserData } from "@/features/admin/types";
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
import UserEditor from "./UserEditor";
import { ListSkeleton } from "../LoadingSkeletons/ListSkeleton";
import EnhancedSearch from "../EnhancedSearch";
import { useSearchFilter } from "../hooks/useSearchFilter";

interface UsersLayerProps {
  onAddChange: (change: any) => void;
}

export default function UsersLayer({ onAddChange }: UsersLayerProps) {
  const { clickHouseClient, userPrivileges } = useAppStore();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Enhanced search and filter
  const {
    searchTerm,
    setSearchTerm,
    options,
    setOptions,
    filterItems,
    loadPreferences,
  } = useSearchFilter();

  const canEdit = userPrivileges?.canAlterUser || userPrivileges?.hasGrantOption;
  const canCreate = userPrivileges?.canCreateUser;
  const canDelete = userPrivileges?.canDropUser;

  // Fetch users from ClickHouse
  useEffect(() => {
    async function fetchUsers() {
      if (!clickHouseClient) return;

      setLoading(true);
      try {
        const query = `
          SELECT
            name,
            id,
            auth_type,
            host_ip,
            host_names,
            host_names_regexp,
            host_names_like,
            default_roles_all,
            default_roles_list,
            default_database,
            grantees_any,
            grantees_list
          FROM system.users
          ORDER BY name
        `;

        const result = await clickHouseClient.query({ query });
        const response = (await result.json()) as ResponseJSON<UserData>;

        setUsers(response.data);
      } catch (error) {
        console.error("Failed to fetch users:", error);
        toast.error("Failed to fetch users");
      } finally {
        setLoading(false);
      }
    }

    fetchUsers();
  }, [clickHouseClient]);

  // Load search preferences on mount
  useEffect(() => {
    loadPreferences("users");
  }, [loadPreferences]);

  // Extract unique auth types for filter dropdown
  const authTypes = Array.from(new Set(users.flatMap((u) => u.auth_type || [])));

  // Filter users using enhanced search
  const filteredUsers = filterItems(users, searchTerm, {
    ...options,
    searchFields: ["name", "id", "auth_type"],
  });

  const handleEditUser = (user: UserData) => {
    setSelectedUser(user);
    setIsEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setSelectedUser(null);
  };

  const handleDeleteUser = (user: UserData) => {
    // Stage deletion change
    onAddChange({
      type: "DROP",
      entityType: "USER",
      entityName: user.name,
      description: `Delete user ${user.name}`,
      sqlStatements: [`DROP USER ${user.name}`],
      originalState: { user },
      newState: null,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Users Management</h3>
          <p className="text-sm text-muted-foreground">
            View and edit existing user accounts and their permissions
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={() => handleEditUser({} as UserData)}
            className="gap-2"
            disabled={loading}
          >
            <UserPlus className="w-4 h-4" />
            Create User
          </Button>
        )}
      </div>

      {/* Enhanced search bar */}
      <EnhancedSearch
        value={searchTerm}
        onChange={(value) => setSearchTerm(value, "users")}
        options={options}
        onOptionsChange={(opts) => setOptions(opts, "users")}
        placeholder="Search users by name, ID, or auth type..."
        disabled={loading}
        showQuickFilters={false}
        authTypes={authTypes}
        layer="users"
      />

      {/* Users table */}
      {loading ? (
        <Card>
          <ListSkeleton rows={5} columns={4} />
        </Card>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchTerm ? "No users found" : "No users available"}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Authentication</TableHead>
                <TableHead>Default Roles</TableHead>
                <TableHead>Host Restrictions</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>
                    {user.auth_type.map((type) => (
                      <Badge key={type} variant="outline" className="mr-1">
                        {type}
                      </Badge>
                    ))}
                  </TableCell>
                  <TableCell>
                    {user.default_roles_all === 1 ? (
                      <Badge>All Roles</Badge>
                    ) : user.default_roles_list && user.default_roles_list.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.default_roles_list.map((role) => (
                          <Badge key={role} variant="secondary">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.host_ip && user.host_ip.length > 0 ? (
                      <Badge variant="outline">IP: {user.host_ip.join(", ")}</Badge>
                    ) : user.host_names && user.host_names.length > 0 ? (
                      <Badge variant="outline">
                        Host: {user.host_names.join(", ")}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Any Host</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                      {canDelete && !user.readonly && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteUser(user)}
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

      {/* User editor dialog */}
      {isEditorOpen && (
        <UserEditor
          user={selectedUser}
          onClose={handleCloseEditor}
          onAddChange={onAddChange}
        />
      )}
    </div>
  );
}
