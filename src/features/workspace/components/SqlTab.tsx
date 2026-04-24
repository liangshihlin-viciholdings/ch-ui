import {
	AlertTriangle,
	Columns2,
	FileX2,
	Loader2,
	RefreshCw,
	Rows2,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { toast } from "sonner";
import { DataTable } from "@/components/common/DataTable";
import DownloadDialog from "@/components/common/DownloadDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
// Component imports
import SQLEditor from "@/features/workspace/editor/SqlEditor";
import { ExplainTab } from "@/features/workspace/explain/components/ExplainTab";
// Store
import useAppStore from "@/stores/workspaceStore";
import type { QueryResult } from "@/types/common";
import EmptyQueryResult from "./EmptyQueryResult";
import MultiResultTabs from "./MultiResultTabs";

interface SqlTabProps {
	tabId: string;
}

// DEBUG: render counter
const sqlTabRenders: Record<string, number> = {};

/**
 * SqlTab: SQL editor on top, query results on the bottom (resizable).
 * Results are rendered via TanStack Table (`DataTable`).
 */
const SqlTab: React.FC<SqlTabProps> = ({ tabId }) => {
	sqlTabRenders[tabId] = (sqlTabRenders[tabId] ?? 0) + 1;
	console.log("[SqlTab] render #", sqlTabRenders[tabId], { tabId });

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

	const renderResultTabs = () => {
		const hasData = tab?.result?.data?.length > 0;
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
					</div>
				</TabsList>
				<div className="flex-1 min-h-0">
					<TabsContent value="results" className="h-full m-0">
						{renderResultsTab()}
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

	const { defaultLayout, onLayoutChanged } = useDefaultLayout({
		groupId: "sql-tab-layout",
		storage: localStorage,
	});

	if (!tab) return null;

	return (
		<div className="h-full">
			<ResizablePanelGroup
				id="sql-tab"
				defaultLayout={defaultLayout}
				onLayoutChanged={onLayoutChanged}
				orientation={orientation}
			>
				<ResizablePanel id="sql-editor" defaultSize="30%" minSize="5%">
					<SQLEditor
						tabId={tabId}
						onRunQuery={handleRunQuery}
						onRunAllQueries={handleRunAllQueries}
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
