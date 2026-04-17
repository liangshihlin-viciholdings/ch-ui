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
import { UserData } from "@/features/admin/types";
import { GrantedPermission } from "../../CreateUser/PrivilegesSection/permissions";
import PermissionTree from "../../CreateUser/PrivilegesSection/PermissionTree";
import useAppStore from "@/stores/workspaceStore";
import { useSqlGenerator } from "../hooks/useSqlGenerator";
import { useGrants } from "../hooks/useGrants";

interface UserEditorProps {
  user: UserData | null;
  onClose: () => void;
  onAddChange: (change: any) => void;
}

export default function UserEditor({ user, onClose, onAddChange }: UserEditorProps) {
  const { dataBaseExplorer } = useAppStore();
  const sqlGenerator = useSqlGenerator();

  const isNewUser = !user || !user.name;

  // Form state
  const [username, setUsername] = useState(user?.name || "");
  const [password, setPassword] = useState("");
  const [defaultDatabase, setDefaultDatabase] = useState(user?.default_database || "");
  const [hostIp, setHostIp] = useState(user?.host_ip?.join(", ") || "");
  const [hostNames, setHostNames] = useState(user?.host_names?.join(", ") || "");
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

  // Fetch current user grants if editing
  const { grants, loading: grantsLoading } = useGrants({
    userName: !isNewUser && user?.name ? user.name : undefined,
  });

  // Update granted permissions when grants are loaded
  useEffect(() => {
    if (!isNewUser && grants.length > 0) {
      setGrantedPermissions(grants);
    }
  }, [grants, isNewUser]);

  const handleSave = () => {
    if (!username.trim()) {
      return;
    }

    if (isNewUser) {
      // Create new user
      const sqlStatements = sqlGenerator.generateCreateUser(username, {
        password,
        defaultDatabase: defaultDatabase || undefined,
        hostIp: hostIp ? hostIp.split(",").map((s) => s.trim()) : undefined,
        hostNames: hostNames ? hostNames.split(",").map((s) => s.trim()) : undefined,
      });

      onAddChange({
        type: "CREATE",
        entityType: "USER",
        entityName: username,
        description: `Create user ${username}`,
        sqlStatements,
        originalState: null,
        newState: {
          username,
          password,
          defaultDatabase,
          hostIp,
          hostNames,
        },
      });
    } else {
      // Update existing user
      const changes: any = {};
      if (password) changes.password = password;
      if (defaultDatabase !== user?.default_database) {
        changes.defaultDatabase = defaultDatabase;
      }
      if (hostIp !== user?.host_ip?.join(", ")) {
        changes.hostIp = hostIp.split(",").map((s) => s.trim());
      }
      if (hostNames !== user?.host_names?.join(", ")) {
        changes.hostNames = hostNames.split(",").map((s) => s.trim());
      }

      if (Object.keys(changes).length > 0) {
        const sqlStatements = sqlGenerator.generateAlterUser(username, changes);

        onAddChange({
          type: "ALTER",
          entityType: "USER",
          entityName: username,
          description: `Update user ${username}`,
          sqlStatements,
          originalState: user,
          newState: changes,
        });
      }
    }

    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {isNewUser ? "Create New User" : `Edit User: ${user?.name}`}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList>
            <TabsTrigger value="basic">Basic Settings</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="host">Host Restrictions</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={!isNewUser}
                placeholder="Enter username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                Password {!isNewUser && "(leave empty to keep current)"}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="defaultDatabase">Default Database</Label>
              <Input
                id="defaultDatabase"
                value={defaultDatabase}
                onChange={(e) => setDefaultDatabase(e.target.value)}
                placeholder="Optional: default database"
                list="databases-list"
              />
              <datalist id="databases-list">
                {databases.map((db) => (
                  <option key={db} value={db} />
                ))}
              </datalist>
            </div>
          </TabsContent>

          <TabsContent value="permissions" className="space-y-4 pt-4">
            <div className="text-sm text-muted-foreground mb-2">
              Select permissions to grant to this user. Changes will be staged for
              review.
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

          <TabsContent value="host" className="space-y-4 pt-4">
            <div className="text-sm text-muted-foreground mb-4">
              Restrict which hosts this user can connect from. Leave empty to allow
              any host.
            </div>

            <div className="space-y-2">
              <Label htmlFor="hostIp">Host IP Addresses</Label>
              <Input
                id="hostIp"
                value={hostIp}
                onChange={(e) => setHostIp(e.target.value)}
                placeholder="e.g., 192.168.1.1, 10.0.0.0/8 (comma-separated)"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of IP addresses or CIDR ranges
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hostNames">Host Names</Label>
              <Input
                id="hostNames"
                value={hostNames}
                onChange={(e) => setHostNames(e.target.value)}
                placeholder="e.g., localhost, example.com (comma-separated)"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of host names
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {isNewUser ? "Stage Create" : "Stage Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
