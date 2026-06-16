import { useState, useEffect, useCallback } from "react";
import type { ResponseJSON } from "@clickhouse/client-web";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, Check, X, Plus, Minus, Shield } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PendingChange } from "../types";
import GrantForm from "../GrantForm";

interface GrantData {
  user_name: string | null;
  role_name: string | null;
  access_type: string;
  database: string | null;
  table: string | null;
  grant_option: number;
}

interface MatrixRow {
  entity: string;
  entityType: "user" | "role";
  grants: Map<string, boolean>;
}

interface PendingGrantChange {
  entity: string;
  entityType: "user" | "role";
  permission: string;
  action: "GRANT" | "REVOKE";
  scope: "global" | "database" | "table";
  database?: string;
  table?: string;
}

interface PermissionsMatrixProps {
  onAddChange?: (change: PendingChange) => void;
  refreshTrigger?: number;
}

export default function PermissionsMatrix({ onAddChange, refreshTrigger }: PermissionsMatrixProps) {
  const { userPrivileges } = useAppStore();
  const clickHouseClient = useAdminClient();
  const [matrixData, setMatrixData] = useState<MatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "user" | "role">("all");
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingGrantChange>>(new Map());
  const [scopePopover, setScopePopover] = useState<{
    entity: string;
    entityType: "user" | "role";
    permission: string;
    hasGrant: boolean;
  } | null>(null);
  const [selectedScope, setSelectedScope] = useState<"global" | "database" | "table">("global");
  const [selectedDatabase, setSelectedDatabase] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [databases, setDatabases] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [isGrantFormOpen, setIsGrantFormOpen] = useState(false);

  const isEditable = !!onAddChange && userPrivileges?.hasGrantOption;

  // Common permission categories to display
  const permissionColumns = [
    "SELECT",
    "INSERT",
    "ALTER",
    "CREATE",
    "DROP",
    "SHOW",
    "SYSTEM",
    "ACCESS MANAGEMENT",
  ];

  // Fetch databases for scope selection
  useEffect(() => {
    async function fetchDatabases() {
      if (!clickHouseClient) return;
      try {
        const result = await clickHouseClient.query({
          query: "SELECT name FROM system.databases WHERE name NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema') ORDER BY name",
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
    async function fetchTables() {
      if (!clickHouseClient || !selectedDatabase) {
        setTables([]);
        return;
      }
      try {
        const result = await clickHouseClient.query({
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

  // Generate unique key for pending change tracking
  const getChangeKey = (entity: string, permission: string, scope: string, database?: string, table?: string) => {
    return `${entity}:${permission}:${scope}:${database || ""}:${table || ""}`;
  };

  // Handle cell click - opens scope popover for editable mode
  const handleCellClick = useCallback(
    (entity: string, entityType: "user" | "role", permission: string, hasGrant: boolean) => {
      if (!isEditable) return;

      // Protect root user
      if (entity === "root") {
        toast.error("Cannot modify root user permissions");
        return;
      }

      setScopePopover({ entity, entityType, permission, hasGrant });
      setSelectedScope("global");
      setSelectedDatabase("");
      setSelectedTable("");
    },
    [isEditable]
  );

  // Confirm the grant/revoke action with selected scope
  const confirmChange = useCallback(() => {
    if (!scopePopover || !onAddChange) return;

    const { entity, entityType, permission, hasGrant } = scopePopover;
    const action = hasGrant ? "REVOKE" : "GRANT";

    // Build scope string for SQL
    let scopeStr = "*.*";
    if (selectedScope === "database" && selectedDatabase) {
      scopeStr = `${selectedDatabase}.*`;
    } else if (selectedScope === "table" && selectedDatabase && selectedTable) {
      scopeStr = `${selectedDatabase}.${selectedTable}`;
    }

    // Generate SQL
    const targetClause = entityType === "user" ? entity : entity;
    const sql = action === "GRANT"
      ? `GRANT ${permission} ON ${scopeStr} TO ${targetClause}`
      : `REVOKE ${permission} ON ${scopeStr} FROM ${targetClause}`;

    // Create pending change
    const change: PendingChange = {
      id: `grant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: action,
      entityType: entityType === "user" ? "USER" : "ROLE",
      entityName: entity,
      description: `${action} ${permission} ON ${scopeStr} ${action === "GRANT" ? "TO" : "FROM"} ${entity}`,
      sqlStatements: [sql],
      originalState: { hasGrant },
      newState: { hasGrant: !hasGrant },
      createdAt: Date.now(),
    };

    onAddChange(change);

    // Track locally for visual feedback
    const changeKey = getChangeKey(entity, permission, selectedScope, selectedDatabase, selectedTable);
    setPendingChanges((prev) => {
      const next = new Map(prev);
      next.set(changeKey, {
        entity,
        entityType,
        permission,
        action,
        scope: selectedScope,
        database: selectedDatabase,
        table: selectedTable,
      });
      return next;
    });

    toast.success(`${action} ${permission} staged for ${entity}`);
    setScopePopover(null);
  }, [scopePopover, onAddChange, selectedScope, selectedDatabase, selectedTable]);

  // Check if a cell has a pending change
  const getPendingChangeForCell = (entity: string, permission: string): PendingGrantChange | undefined => {
    for (const [, change] of pendingChanges) {
      if (change.entity === entity && change.permission === permission) {
        return change;
      }
    }
    return undefined;
  };

  // Fetch grants from ClickHouse
  useEffect(() => {
    async function fetchGrants() {
      if (!clickHouseClient) return;

      setLoading(true);
      try {
        const query = `
          SELECT
            user_name,
            role_name,
            access_type,
            database,
            table,
            grant_option
          FROM system.grants
          ORDER BY user_name, role_name, access_type
        `;

        const result = await clickHouseClient.query({ query });
        const response = (await result.json()) as ResponseJSON<GrantData>;

        // Process grants into matrix format
        const entityGrants = new Map<string, MatrixRow>();

        for (const grant of response.data) {
          const entity = grant.user_name || grant.role_name;
          const entityType = grant.user_name ? "user" : "role";

          if (!entity) continue;

          if (!entityGrants.has(entity)) {
            entityGrants.set(entity, {
              entity,
              entityType,
              grants: new Map(),
            });
          }

          const row = entityGrants.get(entity)!;

          // Check for top-level permissions
          for (const perm of permissionColumns) {
            if (
              grant.access_type.toUpperCase() === perm ||
              grant.access_type.toUpperCase() === "ALL" ||
              grant.access_type.toUpperCase().startsWith(perm + " ")
            ) {
              row.grants.set(perm, true);
            }
          }
        }

        setMatrixData(Array.from(entityGrants.values()));
        // Clear pending changes on refresh
        setPendingChanges(new Map());
      } catch (error) {
        console.error("Failed to fetch grants for matrix:", error);
        toast.error("Failed to load permissions matrix");
      } finally {
        setLoading(false);
      }
    }

    fetchGrants();
  }, [clickHouseClient, refreshTrigger]);

  // Filter matrix data
  const filteredData = matrixData.filter((row) => {
    const matchesSearch = row.entity
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesType =
      filterType === "all" || row.entityType === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-medium">Permissions Matrix</h3>
          <p className="text-sm text-muted-foreground">
            Visual overview of who has which permissions
          </p>
        </div>
        {isEditable && (
          <Button onClick={() => setIsGrantFormOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Grant
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users and roles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={filterType}
          onValueChange={(value) => setFilterType(value as "all" | "user" | "role")}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="user">Users Only</SelectItem>
            <SelectItem value="role">Roles Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Info banner */}
      <div className={`border-l-4 ${isEditable ? "border-green-500 bg-green-500/10" : "border-blue-500 bg-blue-500/10"} p-4`}>
        <p className="text-sm text-muted-foreground">
          {isEditable ? (
            <>
              <strong>Edit mode:</strong> Click any cell to grant or revoke permissions.
              Changes are staged for review before execution. Root user is protected.
            </>
          ) : (
            <>
              <strong>Read-only view:</strong> This matrix shows existing permissions.
              {!userPrivileges?.hasGrantOption && " You need GRANT OPTION privilege to edit permissions."}
            </>
          )}
        </p>
      </div>

      {/* Matrix */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading permissions matrix...
        </div>
      ) : filteredData.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchTerm ? "No matching users or roles found" : "No data available"}
        </div>
      ) : (
        <Card className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10">
                  Entity
                </TableHead>
                <TableHead className="sticky left-0 bg-background z-10">
                  Type
                </TableHead>
                {permissionColumns.map((perm) => (
                  <TableHead key={perm} className="text-center min-w-[100px]">
                    {perm}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((row) => (
                <TableRow key={row.entity}>
                  <TableCell className="sticky left-0 bg-background font-medium">
                    {row.entity}
                  </TableCell>
                  <TableCell className="sticky left-0 bg-background">
                    <Badge variant={row.entityType === "user" ? "default" : "secondary"}>
                      {row.entityType}
                    </Badge>
                  </TableCell>
                  {permissionColumns.map((perm) => {
                    const hasGrant = row.grants.get(perm) || false;
                    const pendingChange = getPendingChangeForCell(row.entity, perm);
                    const isProtected = row.entity === "root";
                    const isCurrentPopover =
                      scopePopover?.entity === row.entity && scopePopover?.permission === perm;

                    return (
                      <TableCell key={perm} className="text-center p-0">
                        <Popover
                          open={isCurrentPopover}
                          onOpenChange={(open) => {
                            if (!open) setScopePopover(null);
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={`w-full h-full p-2 transition-colors ${
                                isEditable && !isProtected
                                  ? "cursor-pointer hover:bg-muted/50"
                                  : isProtected
                                    ? "cursor-not-allowed opacity-50"
                                    : ""
                              } ${pendingChange ? "ring-2 ring-offset-1 ring-yellow-500" : ""}`}
                              onClick={() =>
                                handleCellClick(row.entity, row.entityType, perm, hasGrant)
                              }
                              disabled={!isEditable || isProtected}
                            >
                              {pendingChange ? (
                                pendingChange.action === "GRANT" ? (
                                  <Plus className="w-4 h-4 text-green-500 inline" />
                                ) : (
                                  <Minus className="w-4 h-4 text-red-500 inline" />
                                )
                              ) : hasGrant ? (
                                <Check className="w-4 h-4 text-green-500 inline" />
                              ) : (
                                <X className="w-4 h-4 text-gray-300 inline" />
                              )}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80">
                            <div className="space-y-4">
                              <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4" />
                                <span className="font-medium">
                                  {hasGrant ? "Revoke" : "Grant"} {perm}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {hasGrant
                                  ? `Remove ${perm} from ${row.entity}`
                                  : `Grant ${perm} to ${row.entity}`}
                              </p>

                              <div className="space-y-2">
                                <label className="text-sm font-medium">Scope</label>
                                <Select
                                  value={selectedScope}
                                  onValueChange={(v) => {
                                    setSelectedScope(v as "global" | "database" | "table");
                                    if (v === "global") {
                                      setSelectedDatabase("");
                                      setSelectedTable("");
                                    }
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="global">Global (*.*)</SelectItem>
                                    <SelectItem value="database">Database</SelectItem>
                                    <SelectItem value="table">Table</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {(selectedScope === "database" || selectedScope === "table") && (
                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Database</label>
                                  <Select
                                    value={selectedDatabase}
                                    onValueChange={(v) => {
                                      setSelectedDatabase(v);
                                      setSelectedTable("");
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select database" />
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

                              {selectedScope === "table" && selectedDatabase && (
                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Table</label>
                                  <Select
                                    value={selectedTable}
                                    onValueChange={setSelectedTable}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select table" />
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

                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setScopePopover(null)}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={confirmChange}
                                  disabled={
                                    (selectedScope === "database" && !selectedDatabase) ||
                                    (selectedScope === "table" &&
                                      (!selectedDatabase || !selectedTable))
                                  }
                                >
                                  {hasGrant ? "Revoke" : "Grant"}
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-green-500" />
          <span>Has permission</span>
        </div>
        <div className="flex items-center gap-2">
          <X className="w-4 h-4 text-gray-300" />
          <span>No permission</span>
        </div>
        {isEditable && (
          <>
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-green-500" />
              <span>Pending grant</span>
            </div>
            <div className="flex items-center gap-2">
              <Minus className="w-4 h-4 text-red-500" />
              <span>Pending revoke</span>
            </div>
          </>
        )}
      </div>

      {/* Grant Form Dialog */}
      {onAddChange && (
        <GrantForm
          isOpen={isGrantFormOpen}
          onClose={() => setIsGrantFormOpen(false)}
          onAddChange={onAddChange}
        />
      )}
    </div>
  );
}
