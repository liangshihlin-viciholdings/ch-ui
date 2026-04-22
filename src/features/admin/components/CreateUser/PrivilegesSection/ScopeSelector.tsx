import React, { useMemo, useState } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import { PermissionScope, ScopeType } from "./permissions";

interface ScopeSelectorProps {
  scope: PermissionScope;
  onChange: (scope: PermissionScope) => void;
  allowedScopes: ScopeType[];
  databases: string[];
  tables?: Map<string, string[]>; // database -> tables
  disabled?: boolean;
  compact?: boolean;
}

interface ScopeOption {
  value: string;
  label: string;
  scope: PermissionScope;
}

const ScopeSelector: React.FC<ScopeSelectorProps> = ({
  scope,
  onChange,
  allowedScopes,
  databases,
  tables = new Map(),
  disabled = false,
  compact = false,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);

  // Build scope options
  const scopeOptions = useMemo(() => {
    const options: ScopeOption[] = [];

    // Global scope
    if (allowedScopes.includes("global")) {
      options.push({
        value: "*.*",
        label: "*.* (all)",
        scope: { type: "global" },
      });
    }

    // Database scopes
    if (allowedScopes.includes("database")) {
      for (const db of databases) {
        options.push({
          value: `${db}.*`,
          label: `${db}.*`,
          scope: { type: "database", database: db },
        });
      }
    }

    // Table scopes
    if (allowedScopes.includes("table")) {
      for (const db of databases) {
        const dbTables = tables.get(db) || [];
        for (const table of dbTables) {
          options.push({
            value: `${db}.${table}`,
            label: `${db}.${table}`,
            scope: { type: "table", database: db, table },
          });
        }
      }
    }

    return options;
  }, [allowedScopes, databases, tables]);

  // Filter options based on input
  const filteredOptions = useMemo(() => {
    if (!inputValue) return scopeOptions;
    const query = inputValue.toLowerCase();
    return scopeOptions.filter((opt) =>
      opt.label.toLowerCase().includes(query)
    );
  }, [scopeOptions, inputValue]);

  // Get current value string
  const currentValue = useMemo(() => {
    if (scope.type === "global") return "*.*";
    if (scope.type === "database" && scope.database) return `${scope.database}.*`;
    if (scope.type === "table" && scope.database && scope.table) {
      return `${scope.database}.${scope.table}`;
    }
    return "*.*";
  }, [scope]);

  const handleValueChange = (value: string | null) => {
    if (!value) return;

    const option = scopeOptions.find((opt) => opt.value === value);
    if (option) {
      onChange(option.scope);
      setInputValue(""); // Clear search after selection
      setOpen(false);
    }
  };

  // If only one scope type allowed and no options, show static text
  if (scopeOptions.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        {currentValue}
      </span>
    );
  }

  // If only one option, show static text
  if (scopeOptions.length === 1) {
    return (
      <span className="text-sm text-muted-foreground">
        {scopeOptions[0].label}
      </span>
    );
  }

  return (
    <Combobox
      value={currentValue}
      onValueChange={handleValueChange}
      open={open}
      onOpenChange={setOpen}
      disabled={disabled}
      items={scopeOptions}
    >
      <ComboboxInput
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder={currentValue}
        className={compact ? "h-7 w-[140px] text-xs [&_input]:focus:ring-0 [&_input]:focus:ring-offset-0" : "w-[180px] [&_input]:focus:ring-0 [&_input]:focus:ring-offset-0"}
        showTrigger
        showClear={inputValue.length > 0}
      >
        <ComboboxContent zIndex={100}>
          <ComboboxList>
            {filteredOptions.map((option) => (
              <ComboboxItem
                key={option.value}
                value={option.value}
                className={compact ? "text-xs" : ""}
              >
                {option.label}
              </ComboboxItem>
            ))}
          </ComboboxList>
          <ComboboxEmpty>No scopes found</ComboboxEmpty>
        </ComboboxContent>
      </ComboboxInput>
    </Combobox>
  );
};

export default ScopeSelector;
