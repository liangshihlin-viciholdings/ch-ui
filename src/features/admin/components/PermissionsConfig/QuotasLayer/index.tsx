import { useState, useEffect } from "react";
import type { ResponseJSON } from "@clickhouse/client-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Plus, Edit, Trash2 } from "lucide-react";
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
import QuotaEditor from "./QuotaEditor";
import { ListSkeleton } from "../LoadingSkeletons/ListSkeleton";

interface QuotaData {
  name: string;
  id: string;
  key_names: string[];
  durations: number[];
  max_queries: number[];
  max_query_selects: number[];
  max_query_inserts: number[];
  max_errors: number[];
  max_result_rows: number[];
  max_result_bytes: number[];
  max_read_rows: number[];
  max_read_bytes: number[];
  max_execution_time: number[];
}

interface QuotasLayerProps {
  onAddChange: (change: any) => void;
}

export default function QuotasLayer({ onAddChange }: QuotasLayerProps) {
  const { userPrivileges } = useAppStore();
  const clickHouseClient = useAdminClient();
  const [quotas, setQuotas] = useState<QuotaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedQuota, setSelectedQuota] = useState<QuotaData | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const canEdit = userPrivileges?.canAlterQuota;
  const canCreate = userPrivileges?.canCreateQuota;
  const canDelete = userPrivileges?.canDropQuota;

  // Fetch quotas from ClickHouse
  useEffect(() => {
    async function fetchQuotas() {
      if (!clickHouseClient) return;

      setLoading(true);
      try {
        const query = `
          SELECT
            name,
            id,
            key_names,
            durations,
            max_queries,
            max_query_selects,
            max_query_inserts,
            max_errors,
            max_result_rows,
            max_result_bytes,
            max_read_rows,
            max_read_bytes,
            max_execution_time
          FROM system.quotas
          ORDER BY name
        `;

        const result = await clickHouseClient.query({ query });
        const response = (await result.json()) as ResponseJSON<QuotaData>;

        setQuotas(response.data);
      } catch (error) {
        console.error("Failed to fetch quotas:", error);
        toast.error("Failed to fetch quotas");
      } finally {
        setLoading(false);
      }
    }

    fetchQuotas();
  }, [clickHouseClient]);

  // Filter quotas based on search term
  const filteredQuotas = quotas.filter((quota) =>
    quota.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEditQuota = (quota: QuotaData) => {
    setSelectedQuota(quota);
    setIsEditorOpen(true);
  };

  const handleCreateQuota = () => {
    setSelectedQuota(null);
    setIsEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setSelectedQuota(null);
  };

  const handleDeleteQuota = (quota: QuotaData) => {
    // Stage deletion change
    onAddChange({
      type: "DROP",
      entityType: "QUOTA",
      entityName: quota.name,
      description: `Delete quota ${quota.name}`,
      sqlStatements: [`DROP QUOTA ${quota.name}`],
      originalState: { quota },
      newState: null,
    });
  };

  // Format duration in seconds to human-readable
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Quotas Management</h3>
          <p className="text-sm text-muted-foreground">
            Configure resource limits for users and roles
          </p>
        </div>
        {canCreate && (
          <Button onClick={handleCreateQuota} className="gap-2" disabled={loading}>
            <Plus className="w-4 h-4" />
            Create Quota
          </Button>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search quotas..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
          disabled={loading}
        />
      </div>

      {/* Quotas table */}
      {loading ? (
        <Card>
          <ListSkeleton rows={4} columns={5} />
        </Card>
      ) : filteredQuotas.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchTerm ? "No quotas found" : "No quotas configured"}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quota Name</TableHead>
                <TableHead>Intervals</TableHead>
                <TableHead>Limits</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQuotas.map((quota) => (
                <TableRow key={quota.id}>
                  <TableCell className="font-medium">{quota.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {quota.durations.map((duration, idx) => (
                        <Badge key={idx} variant="outline">
                          {formatDuration(duration)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs space-y-1">
                      {quota.max_queries.some((q) => q > 0) && (
                        <div>Queries: {quota.max_queries.filter((q) => q > 0)[0]}</div>
                      )}
                      {quota.max_errors.some((e) => e > 0) && (
                        <div>Errors: {quota.max_errors.filter((e) => e > 0)[0]}</div>
                      )}
                      {quota.max_result_rows.some((r) => r > 0) && (
                        <div>Result rows: {quota.max_result_rows.filter((r) => r > 0)[0]}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditQuota(quota)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteQuota(quota)}
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

      {/* Quota editor dialog */}
      {isEditorOpen && (
        <QuotaEditor
          quota={selectedQuota}
          onClose={handleCloseEditor}
          onAddChange={onAddChange}
        />
      )}
    </div>
  );
}
