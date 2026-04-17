// src/features/search/components/SearchPage.tsx
// Observability search: free-text query + filter pills running against an
// OTel-style ClickHouse table (defaults to otel_logs). Results render in the
// shared DataTable.

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DataTable } from "@/components/common/DataTable";
import { TimePicker } from "@/features/analytics/components/TimePicker";
import { useTimeRange } from "@/features/analytics/hooks/useTimeRange";
import {
  DEFAULT_LOGS_TABLE,
  DEFAULT_TIMESTAMP_COLUMN,
  type SavedSearchRuntime,
  type SearchFilter,
} from "@/features/search/types";
import { useSearchFilters } from "@/features/search/hooks/useSearchFilters";
import { useSearchData } from "@/features/search/hooks/useSearchData";
import { useSavedSearch } from "@/features/search/hooks/useSavedSearches";
import { SearchInput } from "./SearchInput";
import { FilterPills } from "./FilterPills";
import { SavedSearches } from "./SavedSearches";

export interface SearchPageProps {
  /** When set, loads the saved search's query/filters/table on mount. */
  savedSearchId?: string;
}

export function SearchPage({ savedSearchId }: SearchPageProps) {
  const [tableName, setTableName] = useState<string>(DEFAULT_LOGS_TABLE);
  const [queryText, setQueryText] = useState<string>("");
  // Separate "draft" and "submitted" query so background autocomplete edits
  // don't trigger ClickHouse on every keystroke. Hitting Enter / Search
  // promotes the draft into `submittedQuery`.
  const [submittedQuery, setSubmittedQuery] = useState<string>("");
  const { range, setPreset, setCustom } = useTimeRange("1h");
  const { filters, addFilter, removeFilter, clearFilters, setFilters } =
    useSearchFilters([]);

  const { data: savedSearch } = useSavedSearch(savedSearchId);

  // Hydrate the form when a saved-search id is supplied. We intentionally
  // only sync on id change so local edits aren't clobbered.
  useEffect(() => {
    if (savedSearch) {
      setTableName(savedSearch.tableName);
      setQueryText(savedSearch.query);
      setSubmittedQuery(savedSearch.query);
      setFilters(savedSearch.filters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSearch?.id]);

  const {
    data,
    isFetching,
    error,
  } = useSearchData({
    query: submittedQuery,
    filters,
    tableName,
    dateRange: [range.start, range.end],
    timestampColumn: DEFAULT_TIMESTAMP_COLUMN,
    enabled: !!tableName,
  });

  const handleSubmit = useCallback(() => {
    setSubmittedQuery(queryText);
  }, [queryText]);

  const handleAddFilter = useCallback(
    (filter: SearchFilter) => {
      addFilter(filter);
      // Immediately re-run the query after a filter changes.
      setSubmittedQuery(queryText);
    },
    [addFilter, queryText],
  );

  const handleRemoveFilter = useCallback(
    (index: number) => {
      removeFilter(index);
      setSubmittedQuery(queryText);
    },
    [removeFilter, queryText],
  );

  const handleLoadSaved = useCallback(
    (s: SavedSearchRuntime) => {
      setTableName(s.tableName);
      setQueryText(s.query);
      setSubmittedQuery(s.query);
      setFilters(s.filters);
      toast.success(`Loaded "${s.name}"`);
    },
    [setFilters],
  );

  return (
    <div className="flex-1 w-full overflow-auto">
      <div className="container mx-auto space-y-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              Search
            </h1>
            <p className="text-xs text-muted-foreground">
              Free-text + filter search across OTel tables. Use
              <code className="mx-1 rounded bg-muted px-1 font-mono text-[10px]">
                field:value
              </code>
              for structured matches.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TimePicker
              range={range}
              onPresetChange={setPreset}
              onCustomChange={setCustom}
            />
            <SavedSearches
              currentQuery={queryText}
              currentFilters={filters}
              currentTable={tableName}
              onLoad={handleLoadSaved}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[240px_1fr]">
          <div className="space-y-1">
            <Label htmlFor="search-table" className="text-xs">
              Source table
            </Label>
            <Input
              id="search-table"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="otel_logs"
              className="h-9 font-mono text-xs"
            />
          </div>
          <SearchInput
            value={queryText}
            onChange={setQueryText}
            onSubmit={handleSubmit}
            tableName={tableName}
          />
        </div>

        <FilterPills
          filters={filters}
          onAdd={handleAddFilter}
          onRemove={handleRemoveFilter}
          onClear={clearFilters}
        />

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Search failed</AlertTitle>
            <AlertDescription className="font-mono text-xs">
              {error.message}
            </AlertDescription>
          </Alert>
        ) : isFetching ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : data && data.result.data.length > 0 ? (
          <DataTable data={data.result} height={540} />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
            No results for this query.
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchPage;
