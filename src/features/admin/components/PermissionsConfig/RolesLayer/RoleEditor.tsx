import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GrantedPermission } from "../../CreateUser/PrivilegesSection/permissions";
import PermissionTree from "../../CreateUser/PrivilegesSection/PermissionTree";
import useAppStore from "@/stores/workspaceStore";
import { useSqlGenerator } from "../hooks/useSqlGenerator";
import { useGrants } from "../hooks/useGrants";

interface RoleData {
  name: string;
  id: string;
}

interface RoleEditorProps {
  role: RoleData | null;
  onClose: () => void;
  onAddChange: (change: any) => void;
}

export default function RoleEditor({ role, onClose, onAddChange }: RoleEditorProps) {
  const { dataBaseExplorer } = useAppStore();
  const sqlGenerator = useSqlGenerator();

  const isNewRole = !role || !role.name;

  // Form state
  const [roleName, setRoleName] = useState(role?.name || "");
  const [grantedPermissions, setGrantedPermissions] = useState<GrantedPermission[]>([]);

  // Memoize databases and tables to prevent unnecessary re-renders
  const databases = useMemo(
    () => dataBaseExplorer.map((db) => db.name),
    [dataBaseExplorer]
  );
  const tables = useMemo(
    () => new Map(
      dataBaseExplorer.map((db) => [
        db.name,
        db.children.map((t) => t.name),
      ])
    ),
    [dataBaseExplorer]
  );

  // Fetch current role grants if editing
  const { grants, loading: grantsLoading } = useGrants({
    roleName: !isNewRole && role?.name ? role.name : undefined,
  });

  // Update granted permissions when grants are loaded
  useEffect(() => {
    if (!isNewRole && grants.length > 0) {
      setGrantedPermissions(grants);
    }
  }, [grants, isNewRole]);

  const handleSave = () => {
    if (!roleName.trim()) {
      return;
    }

    if (isNewRole) {
      // Create new role
      const sqlStatements: string[] = [
        sqlGenerator.generateCreateRole(roleName),
      ];

      onAddChange({
        type: "CREATE",
        entityType: "ROLE",
        entityName: roleName,
        description: `Create role ${roleName}`,
        sqlStatements,
        originalState: null,
        newState: {
          roleName,
          permissions: grantedPermissions,
        },
      });
    } else {
      // For now, we'll just stage permission updates
      // In a full implementation, we'd compare current vs new permissions
      // and generate GRANT/REVOKE statements accordingly
      onAddChange({
        type: "ALTER",
        entityType: "ROLE",
        entityName: roleName,
        description: `Update role ${roleName} permissions`,
        sqlStatements: ["-- Permission updates will be generated based on diff"],
        originalState: role,
        newState: {
          permissions: grantedPermissions,
        },
      });
    }

    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {isNewRole ? "Create New Role" : `Edit Role: ${role?.name}`}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList>
            <TabsTrigger value="basic">Basic Settings</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="roleName">Role Name</Label>
              <Input
                id="roleName"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                disabled={!isNewRole}
                placeholder="Enter role name (e.g., analyst, developer)"
              />
              <p className="text-xs text-muted-foreground">
                Role names should be descriptive and lowercase
              </p>
            </div>

            <div className="border-l-4 border-blue-500 bg-blue-500/10 p-4">
              <p className="text-sm text-muted-foreground">
                <strong>Roles</strong> are collections of privileges that can be granted
                to multiple users. They simplify permission management by allowing you to
                define a set of permissions once and assign them to many users.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="permissions" className="space-y-4 pt-4">
            <div className="text-sm text-muted-foreground mb-2">
              Select permissions to grant to this role. All users assigned this role
              will inherit these permissions.
            </div>
            <PermissionTree
              databases={databases}
              tables={tables}
              value={grantedPermissions}
              onChange={setGrantedPermissions}
              defaultScope={{ type: "database" }}
              maxHeight={400}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {isNewRole ? "Stage Create" : "Stage Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
