import React, { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useAppStore from "@/stores/workspaceStore";
import useConnectionStore from "@/stores/connectionStore";

const DatabaseSelector: React.FC = () => {
  const { dataBaseExplorer, selectedDatabase, setSelectedDatabase } =
    useAppStore();

  const { activeConnectionId, setLastSelectedDatabase, getLastSelectedDatabase } =
    useConnectionStore();

  const databases = dataBaseExplorer.map((db) => db.name);

  // Restore selection on connection change
  useEffect(() => {
    if (activeConnectionId && dataBaseExplorer.length > 0) {
      const lastSelected = getLastSelectedDatabase(activeConnectionId);
      const databases = dataBaseExplorer.map((db) => db.name);

      if (lastSelected && databases.includes(lastSelected)) {
        setSelectedDatabase(lastSelected);
      } else {
        setSelectedDatabase(null);
      }
    } else {
      setSelectedDatabase(null);
    }
  }, [activeConnectionId, dataBaseExplorer, getLastSelectedDatabase, setSelectedDatabase]);

  const handleDatabaseChange = (value: string) => {
    const database = value === "all" ? null : value;
    setSelectedDatabase(database);

    if (activeConnectionId) {
      setLastSelectedDatabase(activeConnectionId, database);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <Select
        value={selectedDatabase || "all"}
        onValueChange={handleDatabaseChange}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select database" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Databases</SelectItem>
          {databases.map((db) => (
            <SelectItem key={db} value={db}>
              {db}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default DatabaseSelector;
