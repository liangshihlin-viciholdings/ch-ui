import { useState, useEffect } from "react";
import type { ResponseJSON } from "@clickhouse/client-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Plus, Edit, Trash2 } from "lucide-react";
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
import RowPolicyEditor from "./RowPolicyEditor";

interface RowPolicyData {
  name: string;
  database: string;
  table: string;
  id: string;
  is_restrictive: number;
  filter_using: string;
}

interface RowPoliciesLayerProps {
  onAddChange: (change: any) => void;
}

export default function RowPoliciesLayer({ onAddChange }: RowPoliciesLayerProps) {
  const { clickHouseClient, userPrivileges } = useAppStore();
  const [policies, setPolicies] = useState<RowPolicyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPolicy, setSelectedPolicy] = useState<RowPolicyData | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const canEdit = userPrivileges?.canAlterRowPolicy;
  const canCreate = userPrivileges?.canCreateRowPolicy;
  const canDelete = userPrivileges?.canDropRowPolicy;

  // Fetch row policies from ClickHouse
  useEffect(() => {
    async function fetchPolicies() {
      if (!clickHouseClient) return;

      setLoading(true);
      try {
        const query = `
          SELECT
            name,
            database,
            table,
            id,
            is_restrictive,
            select_filter as filter_using
          FROM system.row_policies
          ORDER BY database, table, name
        `;

        const result = await clickHouseClient.query({ query });
        const response = (await result.json()) as ResponseJSON<RowPolicyData>;

        setPolicies(response.data);
      } catch (error) {
        console.error("Failed to fetch row policies:", error);
        toast.error("Failed to fetch row policies");
      } finally {
        setLoading(false);
      }
    }

    fetchPolicies();
  }, [clickHouseClient]);

  // Filter policies based on search term
  const filteredPolicies = policies.filter(
    (policy) =>
      policy.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      policy.database.toLowerCase().includes(searchTerm.toLowerCase()) ||
      policy.table.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEditPolicy = (policy: RowPolicyData) => {
    setSelectedPolicy(policy);
    setIsEditorOpen(true);
  };

  const handleCreatePolicy = () => {
    setSelectedPolicy(null);
    setIsEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setSelectedPolicy(null);
  };

  const handleDeletePolicy = (policy: RowPolicyData) => {
    // Stage deletion change
    onAddChange({
      type: "DROP",
      entityType: "ROW_POLICY",
      entityName: `${policy.name} ON ${policy.database}.${policy.table}`,
      description: `Delete row policy ${policy.name} on ${policy.database}.${policy.table}`,
      sqlStatements: [
        `DROP ROW POLICY ${policy.name} ON ${policy.database}.${policy.table}`,
      ],
      originalState: { policy },
      newState: null,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Row Policies Management</h3>
          <p className="text-sm text-muted-foreground">
            Row-level security filters for fine-grained access control
          </p>
        </div>
        {canCreate && (
          <Button onClick={handleCreatePolicy} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Policy
          </Button>
        )}
      </div>

      {/* Info banner */}
      <div className="border-l-4 border-blue-500 bg-blue-500/10 p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Row Policies</strong> filter which rows users can see in SELECT
          queries. They're useful for multi-tenant scenarios or restricting data access
          based on user attributes.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search policies..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Policies table */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading row policies...
        </div>
      ) : filteredPolicies.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchTerm ? "No policies found" : "No row policies configured"}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Policy Name</TableHead>
                <TableHead>Database.Table</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Filter</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPolicies.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell className="font-medium">{policy.name}</TableCell>
                  <TableCell>
                    <code className="text-xs">
                      {policy.database}.{policy.table}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={policy.is_restrictive ? "destructive" : "default"}>
                      {policy.is_restrictive ? "Restrictive" : "Permissive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs text-muted-foreground">
                      {policy.filter_using?.substring(0, 50)}
                      {policy.filter_using && policy.filter_using.length > 50 ? "..." : ""}
                    </code>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditPolicy(policy)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePolicy(policy)}
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

      {/* Policy editor dialog */}
      {isEditorOpen && (
        <RowPolicyEditor
          policy={selectedPolicy}
          onClose={handleCloseEditor}
          onAddChange={onAddChange}
        />
      )}
    </div>
  );
}
