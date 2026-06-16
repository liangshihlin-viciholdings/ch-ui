import { useState, useEffect, useCallback } from "react";
import type { ResponseJSON } from "@clickhouse/client-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Code, Shield, Plus } from "lucide-react";
import { useAdminClient } from "@/features/admin/useAdminClient";
import { toast } from "sonner";
import { PendingChange } from "../types";
import {
  PERMISSION_HIERARCHY,
  PermissionNode,
  ScopeType,
} from "../../CreateUser/PrivilegesSection/permissions";

interface GrantFormProps {
  isOpen: boolean;
  onClose: () => void;
  onAddChange: (change: PendingChange) => void;
}

interface EntityOption {
  name: string;
  type: "user" | "role";
}

export default function GrantForm({ isOpen, onClose, onAddChange }: GrantFormProps) {
  const clickHouseClient = useAdminClient();

  // Entity selection
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<EntityOption | null>(null);
  const [loadingEntities, setLoadingEntities] = useState(false);

  // Permission selection
  const [selectedPermission, setSelectedPermission] = useState<PermissionNode | null>(null);

  // Scope selection
  const [scopeType, setScopeType] = useState<ScopeType>("global");
  const [databases, setDatabases] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  // Options
  const [withGrantOption, setWithGrantOption] = useState(false);
  const [isRevoke, setIsRevoke] = useState(false);

  // Fetch users and roles
  useEffect(() => {
    if (!isOpen || !clickHouseClient) return;

    async function fetchEntities() {
      setLoadingEntities(true);
      try {
        const [usersResult, rolesResult] = await Promise.all([
          clickHouseClient!.query({
            query: "SELECT name FROM system.users WHERE name != 'default' ORDER BY name",
          }),
          clickHouseClient!.query({
            query: "SELECT name FROM system.roles ORDER BY name",
          }),
        ]);

        const usersResponse = (await usersResult.json()) as ResponseJSON<{ name: string }>;
        const rolesResponse = (await rolesResult.json()) as ResponseJSON<{ name: string }>;

        const entityList: EntityOption[] = [
          ...usersResponse.data.map((u) => ({ name: u.name, type: "user" as const })),
          ...rolesResponse.data.map((r) => ({ name: r.name, type: "role" as const })),
        ];

        setEntities(entityList);
      } catch (error) {
        console.error("Failed to fetch entities:", error);
        toast.error("Failed to load users and roles");
      } finally {
        setLoadingEntities(false);
      }
    }

    fetchEntities();
  }, [isOpen, clickHouseClient]);

  // Fetch databases
  useEffect(() => {
    if (!clickHouseClient) return;

    async function fetchDatabases() {
      try {
        const result = await clickHouseClient!.query({
          query:
            "SELECT name FROM system.databases WHERE name NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema') ORDER BY name",
        });
        const response = (await result.json()) as ResponseJSON<{ name: string }>;
        setDatabases(response.data.map((d) => d.name));
      } catch (error) {
        console.error("Failed to fetch databases:", error);
      }
    }

    fetchDatabases();
  }, [clickHouseClient]);

  // Fetch tables when database changes
  useEffect(() => {
    if (!clickHouseClient || !selectedDatabase) {
      setTables([]);
      setColumns([]);
      return;
    }

    async function fetchTables() {
      try {
        const result = await clickHouseClient!.query({
          query: "SELECT name FROM system.tables WHERE database = {db:String} ORDER BY name",
          query_params: { db: selectedDatabase },
        });
        const response = (await result.json()) as ResponseJSON<{ name: string }>;
        setTables(response.data.map((t) => t.name));
      } catch (error) {
        console.error("Failed to fetch tables:", error);
      }
    }

    fetchTables();
  }, [clickHouseClient, selectedDatabase]);

  // Fetch columns when table changes
  useEffect(() => {
    if (!clickHouseClient || !selectedDatabase || !selectedTable) {
      setColumns([]);
      return;
    }

    async function fetchColumns() {
      try {
        const result = await clickHouseClient!.query({
          query:
            "SELECT name FROM system.columns WHERE database = {db:String} AND table = {tbl:String} ORDER BY position",
          query_params: { db: selectedDatabase, tbl: selectedTable },
        });
        const response = (await result.json()) as ResponseJSON<{ name: string }>;
        setColumns(response.data.map((c) => c.name));
      } catch (error) {
        console.error("Failed to fetch columns:", error);
      }
    }

    fetchColumns();
  }, [clickHouseClient, selectedDatabase, selectedTable]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedEntity(null);
      setSelectedPermission(null);
      setScopeType("global");
      setSelectedDatabase("");
      setSelectedTable("");
      setSelectedColumns([]);
      setWithGrantOption(false);
      setIsRevoke(false);
    }
  }, [isOpen]);

  // Generate SQL preview
  const generateSql = useCallback((): string => {
    if (!selectedEntity || !selectedPermission) return "";

    const action = isRevoke ? "REVOKE" : "GRANT";
    let privilege = selectedPermission.sqlPrivilege;

    // Handle column-level grants
    if (selectedColumns.length > 0 && scopeType === "table") {
      privilege = `${selectedPermission.sqlPrivilege}(${selectedColumns.join(", ")})`;
    }

    // Build scope
    let scope = "*.*";
    if (scopeType === "database" && selectedDatabase) {
      scope = `${selectedDatabase}.*`;
    } else if (scopeType === "table" && selectedDatabase && selectedTable) {
      scope = `${selectedDatabase}.${selectedTable}`;
    }

    // Build target clause
    const targetKeyword = isRevoke ? "FROM" : "TO";
    let sql = `${action} ${privilege} ON ${scope} ${targetKeyword} ${selectedEntity.name}`;

    // Add WITH GRANT OPTION for grants
    if (!isRevoke && withGrantOption) {
      sql += " WITH GRANT OPTION";
    }

    return sql;
  }, [
    selectedEntity,
    selectedPermission,
    scopeType,
    selectedDatabase,
    selectedTable,
    selectedColumns,
    withGrantOption,
    isRevoke,
  ]);

  // Handle submit
  const handleSubmit = useCallback(() => {
    if (!selectedEntity || !selectedPermission) {
      toast.error("Please select an entity and permission");
      return;
    }

    // Protect root user
    if (selectedEntity.name === "root") {
      toast.error("Cannot modify root user permissions");
      return;
    }

    const sql = generateSql();
    const action = isRevoke ? "REVOKE" : "GRANT";

    const change: PendingChange = {
      id: `grant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: action,
      entityType: selectedEntity.type === "user" ? "USER" : "ROLE",
      entityName: selectedEntity.name,
      description: sql,
      sqlStatements: [sql],
      originalState: {},
      newState: { privilege: selectedPermission.sqlPrivilege, withGrantOption },
      createdAt: Date.now(),
    };

    onAddChange(change);
    toast.success(`${action} staged for ${selectedEntity.name}`);
    onClose();
  }, [selectedEntity, selectedPermission, generateSql, isRevoke, withGrantOption, onAddChange, onClose]);

  // Render permission tree
  const renderPermissionTree = (nodes: PermissionNode[], level = 0) => {
    return nodes.map((node) => {
      const isSelected = selectedPermission?.id === node.id;
      const hasChildren = node.children && node.children.length > 0;

      if (hasChildren) {
        return (
          <AccordionItem key={node.id} value={node.id} className="border-none">
            <AccordionTrigger className="py-2 hover:no-underline">
              <div className="flex items-center gap-2">
                <span className={`text-sm ${isSelected ? "font-bold text-primary" : ""}`}>
                  {node.name}
                </span>
                <Badge variant="outline" className="text-xs">
                  {node.allowedScopes.join(", ")}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pl-4">
              <Button
                variant={isSelected ? "secondary" : "ghost"}
                size="sm"
                className="w-full justify-start mb-1"
                onClick={() => setSelectedPermission(node)}
              >
                <Shield className="w-3 h-3 mr-2" />
                Grant {node.name} (all)
              </Button>
              {renderPermissionTree(node.children!, level + 1)}
            </AccordionContent>
          </AccordionItem>
        );
      }

      return (
        <Button
          key={node.id}
          variant={isSelected ? "secondary" : "ghost"}
          size="sm"
          className="w-full justify-start"
          onClick={() => setSelectedPermission(node)}
        >
          <Shield className="w-3 h-3 mr-2" />
          {node.name}
          <Badge variant="outline" className="ml-auto text-xs">
            {node.allowedScopes.join(", ")}
          </Badge>
        </Button>
      );
    });
  };

  // Check if current scope is valid for selected permission
  const isScopeValid =
    selectedPermission?.allowedScopes.includes(scopeType) ?? true;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            {isRevoke ? "Revoke Permission" : "Grant Permission"}
          </DialogTitle>
          <DialogDescription>
            Create a new {isRevoke ? "REVOKE" : "GRANT"} statement for a user or role.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Action toggle */}
          <div className="flex items-center gap-4">
            <Label>Action:</Label>
            <div className="flex gap-2">
              <Button
                variant={!isRevoke ? "default" : "outline"}
                size="sm"
                onClick={() => setIsRevoke(false)}
              >
                GRANT
              </Button>
              <Button
                variant={isRevoke ? "destructive" : "outline"}
                size="sm"
                onClick={() => setIsRevoke(true)}
              >
                REVOKE
              </Button>
            </div>
          </div>

          {/* Entity selection */}
          <div className="space-y-2">
            <Label>User or Role</Label>
            <Select
              value={selectedEntity ? `${selectedEntity.type}:${selectedEntity.name}` : ""}
              onValueChange={(value) => {
                const [type, name] = value.split(":");
                const entity = entities.find(
                  (e) => e.type === type && e.name === name
                );
                setSelectedEntity(entity || null);
              }}
              disabled={loadingEntities}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select user or role..." />
              </SelectTrigger>
              <SelectContent>
                {entities.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    {loadingEntities ? "Loading..." : "No users or roles found"}
                  </SelectItem>
                ) : (
                  entities.map((entity) => (
                    <SelectItem
                      key={`${entity.type}:${entity.name}`}
                      value={`${entity.type}:${entity.name}`}
                      disabled={entity.name === "root"}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant={entity.type === "user" ? "default" : "secondary"}>
                          {entity.type}
                        </Badge>
                        {entity.name}
                        {entity.name === "root" && (
                          <Badge variant="outline" className="text-red-500">
                            protected
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Permission selection */}
          <div className="space-y-2">
            <Label>Permission</Label>
            <ScrollArea className="h-48 border rounded-md p-2">
              <Accordion type="multiple" className="w-full">
                {renderPermissionTree(PERMISSION_HIERARCHY)}
              </Accordion>
            </ScrollArea>
            {selectedPermission && (
              <p className="text-sm text-muted-foreground">
                Selected: <strong>{selectedPermission.sqlPrivilege}</strong>
                {selectedPermission.description && ` - ${selectedPermission.description}`}
              </p>
            )}
          </div>

          {/* Scope selection */}
          <div className="space-y-4">
            <Label>Scope</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={scopeType === "global" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setScopeType("global");
                  setSelectedDatabase("");
                  setSelectedTable("");
                  setSelectedColumns([]);
                }}
                disabled={!!selectedPermission && !selectedPermission.allowedScopes.includes("global")}
              >
                Global (*.)
              </Button>
              <Button
                variant={scopeType === "database" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setScopeType("database");
                  setSelectedTable("");
                  setSelectedColumns([]);
                }}
                disabled={!!selectedPermission && !selectedPermission.allowedScopes.includes("database")}
              >
                Database
              </Button>
              <Button
                variant={scopeType === "table" ? "default" : "outline"}
                size="sm"
                onClick={() => setScopeType("table")}
                disabled={!!selectedPermission && !selectedPermission.allowedScopes.includes("table")}
              >
                Table
              </Button>
            </div>

            {!isScopeValid && selectedPermission && (
              <p className="text-sm text-destructive">
                {selectedPermission.name} does not support {scopeType} scope.
                Allowed: {selectedPermission.allowedScopes.join(", ")}
              </p>
            )}

            {(scopeType === "database" || scopeType === "table") && (
              <div className="space-y-2">
                <Label>Database</Label>
                <Select value={selectedDatabase} onValueChange={setSelectedDatabase}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select database..." />
                  </SelectTrigger>
                  <SelectContent>
                    {databases.map((db) => (
                      <SelectItem key={db} value={db}>
                        {db}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scopeType === "table" && selectedDatabase && (
              <div className="space-y-2">
                <Label>Table</Label>
                <Select value={selectedTable} onValueChange={setSelectedTable}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select table..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map((tbl) => (
                      <SelectItem key={tbl} value={tbl}>
                        {tbl}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Column selection for column-level grants */}
            {scopeType === "table" &&
              selectedTable &&
              columns.length > 0 &&
              (selectedPermission?.sqlPrivilege === "SELECT" ||
                selectedPermission?.sqlPrivilege === "INSERT") && (
                <div className="space-y-2">
                  <Label>Columns (optional - leave empty for all)</Label>
                  <ScrollArea className="h-32 border rounded-md p-2">
                    {columns.map((col) => (
                      <div key={col} className="flex items-center gap-2 py-1">
                        <Checkbox
                          id={`col-${col}`}
                          checked={selectedColumns.includes(col)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedColumns([...selectedColumns, col]);
                            } else {
                              setSelectedColumns(selectedColumns.filter((c) => c !== col));
                            }
                          }}
                        />
                        <label htmlFor={`col-${col}`} className="text-sm cursor-pointer">
                          {col}
                        </label>
                      </div>
                    ))}
                  </ScrollArea>
                </div>
              )}
          </div>

          {/* Options */}
          {!isRevoke && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="with-grant-option"
                checked={withGrantOption}
                onCheckedChange={(checked) => setWithGrantOption(!!checked)}
              />
              <label htmlFor="with-grant-option" className="text-sm cursor-pointer">
                WITH GRANT OPTION (allow recipient to grant this permission to others)
              </label>
            </div>
          )}

          {/* SQL Preview */}
          {selectedEntity && selectedPermission && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Code className="w-4 h-4" />
                SQL Preview
              </Label>
              <pre className="bg-muted p-3 rounded-md text-sm font-mono overflow-x-auto">
                {generateSql()}
              </pre>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedEntity || !selectedPermission || !isScopeValid}
          >
            Stage {isRevoke ? "Revoke" : "Grant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
