import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, SearchX, RefreshCcw, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SavedQuery } from "@/types/common";

interface SavedQueriesListProps {
  queries: SavedQuery[];
  onQueryOpen: (query: SavedQuery) => void;
  onQueryDelete: (id: string) => void;
  onRefresh: () => void;
}

const SavedQueriesList: React.FC<SavedQueriesListProps> = ({
  queries,
  onQueryOpen,
  onQueryDelete,
  onRefresh,
}) => {
  const [searchValue, setSearchValue] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filteredQueries = useMemo(() => {
    if (!searchValue) return queries;
    return queries.filter((query) =>
      query.name.toLowerCase().includes(searchValue.toLowerCase())
    );
  }, [queries, searchValue]);

  const pendingQuery = pendingDeleteId
    ? queries.find((q) => q.id === pendingDeleteId)
    : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none p-3 border-b space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search saved queries"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="pl-9 pr-9 py-2 w-full h-8 text-sm"
            />
            {searchValue && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSearchValue("")}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6"
              >
                <SearchX className="w-4 h-4" />
              </Button>
            )}
          </div>
          <Button size="icon" variant="outline" onClick={onRefresh}>
            <RefreshCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredQueries.length > 0 ? (
            filteredQueries.map((query) => (
              <div
                key={query.id}
                className="group text-xs cursor-pointer hover:bg-muted-foreground/10 rounded-md p-2 mb-1 flex items-start gap-1"
                onClick={() => onQueryOpen(query)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="flex-1 truncate font-medium">
                      {query.name}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2 shrink-0">
                      {new Date(query.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  {query.databaseName && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {query.databaseName}
                    </div>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDeleteId(query.id);
                  }}
                  title="Delete query"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))
          ) : (
            <div className="p-4 text-muted-foreground text-xs text-center">
              {searchValue
                ? "No queries match your search"
                : "No saved queries found"}
            </div>
          )}
        </div>
      </ScrollArea>

      <AlertDialog
        open={!!pendingDeleteId}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved query?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingQuery?.name}&rdquo; will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteId) onQueryDelete(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SavedQueriesList;
