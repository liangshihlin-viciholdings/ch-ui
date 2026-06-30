import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, RefreshCcw } from "lucide-react";
import useAppStore from "@/stores/workspaceStore";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/common/DataTable";

interface IndicesSectionProps {
  database: string;
  tableName: string;
}

interface QueryResult {
  meta?: any[];
  data?: any[];
  rows?: number;
  statistics?: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
}

// Read-only view of ClickHouse data-skipping indices. The primary / sorting key
// is part of the table engine and is shown in the Schema and DDL tabs, not here.
const IndicesSection: React.FC<IndicesSectionProps> = ({
  database,
  tableName,
}) => {
  const { runQuery } = useAppStore();
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchIndices = async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const query = `
        SELECT name, type_full, expr, granularity,
               formatReadableSize(data_compressed_bytes) AS compressed_size
        FROM system.data_skipping_indices
        WHERE database = '${database}' AND table = '${tableName}'
        ORDER BY name
      `;
      const response = await runQuery(query);
      setResult(response);
    } catch (err: any) {
      setError(err.message || "Failed to fetch indices.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  React.useEffect(() => {
    fetchIndices();
  }, [database, tableName]);

  if (loading) {
    return (
      <Card>
        <CardContent className="min-h-[400px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading indices...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasRows = !!result?.data && result.data.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Data-skipping indices</CardTitle>
        <Button
          onClick={() => fetchIndices(true)}
          variant="ghost"
          className="flex items-center space-x-2 text-sm"
          disabled={isRefreshing}
        >
          <RefreshCcw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </CardHeader>
      <CardContent className="max-h-[500px] overflow-auto">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : hasRows ? (
          <div
            className="rounded-md border overflow-hidden"
            style={{ height: "400px" }}
          >
            <DataTable data={result as any} height="100%" />
          </div>
        ) : (
          <Alert>
            <AlertTitle>No indices</AlertTitle>
            <AlertDescription>
              This table has no data-skipping indices. Use “Edit Schema” on the
              table to add one.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default IndicesSection;
