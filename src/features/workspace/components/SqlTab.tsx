import React, { useState, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2,
  FileX2,
  RefreshCw,
  AlertTriangle,
  Columns2,
  Rows2,
} from "lucide-react";
import { DataTable } from "@/components/common/DataTable";

// Component imports
import SQLEditor from "@/features/workspace/editor/SqlEditor";
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import DownloadDialog from "@/components/common/DownloadDialog";
import EmptyQueryResult from "./EmptyQueryResult";
import StatisticsDisplay from "./StatisticsDisplay";
import MultiResultTabs from "./MultiResultTabs";
import { ExplainTab } from "@/features/workspace/explain/components/ExplainTab";

// Store
import useAppStore from "@/stores/workspaceStore";
import { useDefaultLayout } from "react-resizable-panels";
import type { QueryResult } from "@/types/common";

interface SqlTabProps {
  tabId: string;
}

/**
 * SqlTab: SQL editor on top, query results on the bottom (resizable).
 * Results are rendered via TanStack Table (`DataTable`).
 */
const SqlTab: React.FC<SqlTabProps> = ({ tabId }) => {
  const {
    getTabById,
    runQuery,
    runAllQueries,
    cancelQuery,
    fetchDatabaseInfo,
    updateTab,
  } = useAppStore();
  const tab = getTabById(tabId);
  const [activeTab, setActiveTab] = useState<string>("results");

  // Last query for refresh
  const [lastQuery, setLastQuery] = useState<string>("");
  const [, setIsEditorFocused] = useState(false);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">(
    () => {
      try {
        const saved = localStorage.getItem("sql-editor-layout-orientation");
        if (saved === "horizontal" || saved === "vertical") return saved;
      } catch (error) {
        console.error(
          "Failed to load orientation preference from localStorage:",
          error,
        );
      }
      return "vertical";
    },
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Detect schema-changing queries to refresh database explorer
  const isSchemaModifyingQuery = (query: string): boolean => {
    return /^\s*(CREATE|DROP|ALTER|TRUNCATE|RENAME|INSERT|UPDATE|DELETE)\s+/i.test(
      query,
    );
  };

  const handleRunQuery = useCallback(
    async (query: string) => {
      setLastQuery(query);
      try {
        await updateTab(tabId, {
          results: undefined,
          activeResultIndex: undefined,
        });

        const shouldRefresh = isSchemaModifyingQuery(query);
        const result = await runQuery(query, tabId);

        if (!result.error && shouldRefresh) {
          await fetchDatabaseInfo();
          toast.success("Data Explorer refreshed due to schema change");
        }
      } catch (error) {
        console.error("Error running query:", error);
        toast.error(
          "Failed to execute query. Please check the console for more details.",
        );
      }
    },
    [runQuery, tabId, fetchDatabaseInfo, updateTab],
  );

  const handleRunAllQueries = useCallback(
    async (queries: string[]) => {
      try {
        const hasSchemaChange = queries.some(isSchemaModifyingQuery);
        await runAllQueries(queries, tabId);

        if (hasSchemaChange) {
          await fetchDatabaseInfo();
          toast.success("Data Explorer refreshed due to schema change");
        }

        toast.success(`Executed ${queries.length} queries`);
      } catch (error) {
        console.error("Error running queries:", error);
        toast.error(
          "Failed to execute queries. Please check the console for more details.",
        );
      }
    },
    [runAllQueries, tabId, fetchDatabaseInfo],
  );

  const handleRefresh = useCallback(async () => {
    if (lastQuery) {
      await handleRunQuery(lastQuery);
    }
  }, [lastQuery, handleRunQuery]);

  const toggleOrientation = useCallback(() => {
    setOrientation((prev) => (prev === "vertical" ? "horizontal" : "vertical"));
  }, []);

  const handleResultIndexChange = useCallback(
    (index: number) => {
      updateTab(tabId, { activeResultIndex: index });
    },
    [tabId, updateTab],
  );

  // Save orientation preference to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("sql-editor-layout-orientation", orientation);
    } catch (error) {
      console.error(
        "Failed to save orientation preference to localStorage:",
        error,
      );
    }
  }, [orientation]);

  // Elapsed time counter for loading state
  useEffect(() => {
    if (!tab?.isLoading) {
      setElapsedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [tab?.isLoading]);

  // Format elapsed seconds as mm:ss
  const formatElapsedTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Metadata table displays column name/type. Build a pseudo QueryResult so
  // DataTable can reuse the same rendering/pagination pipeline.
  const metadataQueryResult = useMemo<QueryResult | null>(() => {
    const metaRows = tab?.result?.meta as
      | Array<{ name: string; type: string }>
      | undefined;
    if (!metaRows?.length) return null;
    return {
      meta: [
        { name: "name" },
        { name: "type" },
      ],
      data: metaRows.map((row) => ({ name: row.name, type: row.type })),
      statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
    };
  }, [tab?.result?.meta]);

  const renderLoading = () => (
    <div className="h-full w-full flex flex-col items-center justify-center gap-3">
      <div className="flex items-center">
        <Loader2 size={24} className="animate-spin mr-2" />
        <p>Running query...</p>
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">
        {formatElapsedTime(elapsedSeconds)}
      </p>
      <Button variant="outline" size="sm" onClick={() => cancelQuery(tabId)}>
        Cancel
      </Button>
    </div>
  );

  const renderError = (errorMessage: string) => (
    <div className="m-4">
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    </div>
  );

  const renderEmpty = () => (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center">
        <FileX2 size={48} className="text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">
          There's no data yet! Run a query to get started.
        </p>
      </div>
    </div>
  );

  const renderResultsTab = () => {
    const result = tab?.result as QueryResult | undefined;
    if (!result?.data?.length) {
      return result?.statistics ? (
        <EmptyQueryResult statistics={result.statistics} />
      ) : null;
    }
    return (
      <div className="h-full flex flex-col">
        <DataTable data={result} height="100%" />
      </div>
    );
  };

  const renderMetadataTab = () => {
    if (!metadataQueryResult) return null;
    return (
      <div className="h-full flex flex-col">
        <DataTable data={metadataQueryResult} height="100%" />
      </div>
    );
  };

  const renderStatisticsResults = () => {
    if (!tab?.result?.statistics) return null;
    return <StatisticsDisplay statistics={tab.result.statistics} />;
  };

  const renderResultTabs = () => {
    const hasData = tab?.result?.data?.length > 0;
    const hasMeta = tab?.result?.meta?.length > 0;
    const hasExplain = tab?.result?.explainResult !== undefined;

    return (
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="h-full flex flex-col"
      >
        <TabsList className="rounded-none border-b gap-1 pr-4">
          <TabsTrigger value="results">
            Results
            {hasData && (
              <span className="ml-2 text-muted-foreground inline-flex items-center gap-1">
                ({tab?.result.data.length.toLocaleString()} rows)
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle className="h-3.5 w-3.5 text-orange-500 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Results may be truncated for performance.</p>
                      <p className="text-xs text-muted-foreground">
                        Use LIMIT clause for precise control.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="metadata">
            Metadata
            {hasMeta && (
              <span className="ml-2 text-muted-foreground">
                ({tab?.result.meta.length} columns)
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
          {hasExplain && (
            <TabsTrigger value="explain">
              Explain
              <span className="ml-2 text-muted-foreground">
                ({tab?.result.explainResult.type})
              </span>
            </TabsTrigger>
          )}

          <div className="ml-auto flex items-center gap-1">
            {activeTab === "results" && lastQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleRefresh}
                disabled={tab?.isLoading}
                title="Refresh results"
              >
                <RefreshCw
                  className={`h-4 w-4 ${tab?.isLoading ? "animate-spin" : ""}`}
                />
              </Button>
            )}

            {hasData && activeTab === "results" && (
              <Button
                variant={orientation !== "vertical" ? "default" : "ghost"}
                size="sm"
                className="h-6 w-6 p-0"
                onClick={toggleOrientation}
                title={`Switch to ${orientation === "vertical" ? "horizontal" : "vertical"} layout`}
              >
                {orientation === "vertical" ? (
                  <Columns2 className="h-4 w-4" />
                ) : (
                  <Rows2 className="h-4 w-4" />
                )}
              </Button>
            )}

            {hasData && activeTab === "results" && (
              <DownloadDialog data={tab?.result.data} />
            )}
            {hasMeta && activeTab === "metadata" && (
              <DownloadDialog data={tab?.result.meta} />
            )}
          </div>
        </TabsList>
        <div className="flex-1 min-h-0">
          <TabsContent value="results" className="h-full m-0">
            {renderResultsTab()}
          </TabsContent>
          <TabsContent value="metadata" className="h-full m-0">
            {renderMetadataTab()}
          </TabsContent>
          <TabsContent value="statistics" className="h-full m-0">
            {renderStatisticsResults()}
          </TabsContent>
          {hasExplain && (
            <TabsContent value="explain" className="h-full m-0">
              <ExplainTab explainResult={tab!.result.explainResult!} />
            </TabsContent>
          )}
        </div>
      </Tabs>
    );
  };

  const renderResults = () => {
    if (tab?.isLoading) return renderLoading();
    if (tab?.error) return renderError(tab.error);

    if (tab?.results && tab.results.length > 0) {
      return (
        <MultiResultTabs
          results={tab.results}
          activeResultIndex={tab.activeResultIndex ?? 0}
          onResultIndexChange={handleResultIndexChange}
        />
      );
    }

    if (!tab?.result) return renderEmpty();
    if (tab.result.error) return renderError(tab.result.error);

    return renderResultTabs();
  };

  if (!tab) return null;

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    groupId: "sql-tab-layout",
    storage: localStorage,
  });

  return (
    <div className="h-full">
      <ResizablePanelGroup
        id="sql-tab"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        orientation={orientation}
      >
        <ResizablePanel
          id="sql-editor"
          defaultSize="50%"
          minSize={200}
          collapsible
          collapsedSize={30}
        >
          <SQLEditor
            tabId={tabId}
            onRunQuery={handleRunQuery}
            onRunAllQueries={handleRunAllQueries}
            onFocusChange={setIsEditorFocused}
          />
        </ResizablePanel>
        <ResizableHandle
          className={orientation === "horizontal" ? "w-1 h-full" : "w-full h-1"}
          withHandle
        />
        <ResizablePanel
          id="sql-results"
          minSize={200}
          collapsible
          collapsedSize={0}
        >
          {renderResults()}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default SqlTab;
