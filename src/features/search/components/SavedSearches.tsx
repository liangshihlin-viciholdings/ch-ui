// src/features/search/components/SavedSearches.tsx
// Dropdown + save dialog for saved searches. Keeps the page layout clean
// by hiding both the list and the save form behind a single button.

import { useState } from "react";
import { BookmarkIcon, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  SavedSearchRuntime,
  SearchFilter,
} from "@/features/search/types";
import {
  useSavedSearches,
  useCreateSavedSearch,
  useDeleteSavedSearch,
} from "@/features/search/hooks/useSavedSearches";

export interface SavedSearchesProps {
  currentQuery: string;
  currentFilters: SearchFilter[];
  currentTable: string;
  currentConnectionId?: string | null;
  onLoad: (search: SavedSearchRuntime) => void;
}

export function SavedSearches({
  currentQuery,
  currentFilters,
  currentTable,
  currentConnectionId,
  onLoad,
}: SavedSearchesProps) {
  const { data: searches = [], isLoading } = useSavedSearches();
  const createSearch = useCreateSavedSearch();
  const deleteSearch = useDeleteSavedSearch();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      const created = await createSearch.mutateAsync({
        name: name.trim(),
        query: currentQuery,
        tableName: currentTable,
        filters: currentFilters,
        connectionId: currentConnectionId ?? null,
      });
      toast.success(`Saved "${created.name}"`);
      setSaveOpen(false);
      setName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSearch.mutateAsync(id);
      toast.success("Deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <BookmarkIcon className="mr-1 h-3.5 w-3.5" />
              Saved
              {searches.length > 0 && (
                <span className="ml-1 text-muted-foreground">
                  ({searches.length})
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-xs">
              Saved searches
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : searches.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                No saved searches yet.
              </div>
            ) : (
              searches.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  className="flex items-center justify-between gap-2"
                  onSelect={(e) => {
                    e.preventDefault();
                    onLoad(s);
                  }}
                >
                  <span className="flex-1 truncate font-mono text-xs">
                    {s.name}
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(s.id);
                    }}
                    aria-label={`Delete ${s.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setSaveOpen(true)}
        >
          Save
        </Button>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save search</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="saved-search-name">Name</Label>
            <Input
              id="saved-search-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Errors in order-service"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createSearch.isPending}
            >
              {createSearch.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default SavedSearches;
