import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Check, X } from "lucide-react";
import useAppStore from "@/stores/workspaceStore";
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

export default function PermissionsMatrix() {
  const { clickHouseClient } = useAppStore();
  const [matrixData, setMatrixData] = useState<MatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "user" | "role">("all");

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
        const response = await result.json<{ data: GrantData[] }>();

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
      } catch (error) {
        console.error("Failed to fetch grants for matrix:", error);
        toast.error("Failed to load permissions matrix");
      } finally {
        setLoading(false);
      }
    }

    fetchGrants();
  }, [clickHouseClient]);

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
      <div>
        <h3 className="text-lg font-medium">Permissions Matrix</h3>
        <p className="text-sm text-muted-foreground">
          Visual overview of who has which permissions
        </p>
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
      <div className="border-l-4 border-blue-500 bg-blue-500/10 p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Read-only view:</strong> This matrix shows existing permissions. Use
          the other layers (Users, Roles) to modify permissions.
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
                  {permissionColumns.map((perm) => (
                    <TableCell key={perm} className="text-center">
                      {row.grants.get(perm) ? (
                        <Check className="w-4 h-4 text-green-500 inline" />
                      ) : (
                        <X className="w-4 h-4 text-gray-300 inline" />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-green-500" />
          <span>Has permission</span>
        </div>
        <div className="flex items-center gap-2">
          <X className="w-4 h-4 text-gray-300" />
          <span>No permission</span>
        </div>
      </div>
    </div>
  );
}
