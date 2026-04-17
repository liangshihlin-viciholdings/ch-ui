// src/features/search/components/SearchInput.tsx
// Free-text search bar with history-backed autocomplete. Suggestions come
// from useAutoComplete (localStorage) — see the STUB note in that hook.

import { useRef, useState } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAutoComplete } from "@/features/search/hooks/useAutoComplete";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  tableName: string;
  placeholder?: string;
}

export function SearchInput({
  value,
  onChange,
  onSubmit,
  tableName,
  placeholder = "Search… (e.g. level:error AND service:api)",
}: SearchInputProps) {
  const [focused, setFocused] = useState(false);
  const { suggestions, recordSearch } = useAutoComplete(tableName);
  const blurTimer = useRef<number | null>(null);

  const handleSubmit = () => {
    if (value.trim()) recordSearch(value.trim());
    onSubmit();
  };

  const handleBlur = () => {
    // Delay close so a click on a suggestion lands before we unmount it.
    blurTimer.current = window.setTimeout(() => setFocused(false), 120);
  };

  const handleFocus = () => {
    if (blurTimer.current) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    setFocused(true);
  };

  const showSuggestions = focused && suggestions.length > 0;

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={placeholder}
            className="h-9 pl-7 pr-8 font-mono text-xs"
          />
          {value && (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => onChange("")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button size="sm" onClick={handleSubmit}>
          Search
        </Button>
      </div>

      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-md border border-border bg-popover shadow-md">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Recent
          </div>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="flex w-full items-center px-2 py-1.5 text-left font-mono text-xs hover:bg-muted"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
                setFocused(false);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchInput;
