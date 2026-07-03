import React, { useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { DataTable } from "@/components/common/DataTable";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import DownloadDialog from "@/components/common/DownloadDialog";
import EmptyQueryResult from "./EmptyQueryResult";
import { ExplainTab } from "@/features/workspace/explain/components/ExplainTab";
import type { MultiQueryResult } from "@/types/common";

interface MultiResultTabsProps {
  results: MultiQueryResult[];
  activeResultIndex: number;
  onResultIndexChange?: (index: number) => void;
}

const getQueryLabel = (queryText: string, index: number): string => {
  const firstLine = queryText.split("\n")[0].trim();
  const maxLen = 25;
  if (firstLine.length <= maxLen) {
    return firstLine;
  }
  return `Query ${index + 1}`;
};

const MultiResultTabs: React.FC<MultiResultTabsProps> = ({
  results,
  activeResultIndex,
  onResultIndexChange,
}) => {
  const [selectedResultIndex, setSelectedResultIndex] =
    useState(activeResultIndex);
  const [activeTab, setActiveTab] = useState<string>("results");

  const handleResultIndexChange = (index: string) => {
    const numIndex = parseInt(index, 10);
    setSelectedResultIndex(numIndex);
    onResultIndexChange?.(numIndex);
  };

  const currentResult = results[selectedResultIndex];

  const renderResultsTab = () => {
    if (!currentResult) return null;
    const result = currentResult.result;

    if (result.error) {
      return (
        <div className="m-4">
          <Alert variant="destructive">
            <AlertTitle>Error in Query {selectedResultIndex + 1}</AlertTitle>
            <AlertDescription className="font-mono text-sm whitespace-pre-wrap">
              {result.error}
            </AlertDescription>
          </Alert>
          <div className="mt-4 p-3 bg-muted rounded-md">
            <p className="text-sm font-medium mb-1">Query:</p>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
              {currentResult.queryText}
            </pre>
          </div>
        </div>
      );
    }

    if (!result.data?.length) {
      return result.statistics ? (
        <EmptyQueryResult statistics={result.statistics} />
      ) : null;
    }

    return (
      <div className="h-full flex flex-col">
        <DataTable data={result} height="100%" enableTranspose />
      </div>
    );
  };

  if (!results.length) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No query results to display
      </div>
    );
  }

  const hasData = (currentResult?.result?.data?.length ?? 0) > 0;
  const hasError = !!currentResult?.result?.error;
  const hasExplain = currentResult?.result?.explainResult !== undefined;

  return (
    <div className="h-full flex flex-col">
      {/* Query Result Selector Tabs */}
      <div className="border-b bg-muted/30">
        <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto">
          {results.map((r, index) => {
            const isError = !!r.result.error;
            const isSelected = index === selectedResultIndex;
            return (
              <button
                key={index}
                onClick={() => handleResultIndexChange(String(index))}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md whitespace-nowrap
                  transition-colors duration-150
                  ${
                    isSelected
                      ? "bg-background shadow-sm border"
                      : "hover:bg-muted"
                  }
                  ${isError ? "text-destructive" : ""}
                `}
              >
                {isError ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                )}
                <span className="truncate max-w-30">
                  {getQueryLabel(r.queryText, index)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Result Content Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <TabsList className="rounded-none gap-1 border-b">
          <TabsTrigger value="results">
            Results
            {hasData && !hasError && (
              <span className="ml-2 text-muted-foreground">
                ({currentResult?.result.data.length} rows)
              </span>
            )}
          </TabsTrigger>
          {hasExplain && (
            <TabsTrigger value="explain">
              Explain
              <span className="ml-2 text-muted-foreground">
                ({currentResult.result.explainResult!.type})
              </span>
            </TabsTrigger>
          )}

          <div className="ml-auto flex items-center">
            {hasData && !hasError && activeTab === "results" && (
              <DownloadDialog data={currentResult?.result.data} />
            )}
          </div>
        </TabsList>
        <div className="flex-1 overflow-hidden">
          <TabsContent value="results" className="h-full m-0">
            {renderResultsTab()}
          </TabsContent>
          {hasExplain && (
            <TabsContent value="explain" className="h-full m-0">
              <ExplainTab explainResult={currentResult.result.explainResult!} />
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
};

export default React.memo(MultiResultTabs);
