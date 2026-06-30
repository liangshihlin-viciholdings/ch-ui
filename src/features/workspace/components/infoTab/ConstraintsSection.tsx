import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import useAppStore from "@/stores/workspaceStore";
import {
  parseClickHouseConstraints,
  buildConstraintEditDDL,
} from "@/lib/schema-ddl/clickhouse";

interface ConstraintsSectionProps {
  database: string;
  tableName: string;
  /** The table's CREATE TABLE statement (system.tables.create_table_query). */
  createTableQuery: string;
}

// ClickHouse has no system.constraints table, so CHECK constraints are parsed
// from the table's CREATE statement (already fetched by InfoTab). Constraints
// are validated on INSERT only — they are not enforced on existing rows.
const ConstraintsSection: React.FC<ConstraintsSectionProps> = ({
  database,
  tableName,
  createTableQuery,
}) => {
  const { addTab, getTabById, setActiveTab } = useAppStore();
  const constraints = React.useMemo(
    () => parseClickHouseConstraints(createTableQuery ?? ""),
    [createTableQuery],
  );

  const openEditor = async () => {
    const tabId = `edit-constraints-${database}-${tableName}`;
    const existing = getTabById(tabId);
    if (existing) {
      setActiveTab(existing.id);
      return;
    }
    await addTab({
      id: tabId,
      type: "sql",
      title: `Edit constraints - ${tableName}`,
      content: buildConstraintEditDDL(database, tableName, constraints),
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Constraints</CardTitle>
        <Button
          onClick={openEditor}
          variant="ghost"
          className="flex items-center space-x-2 text-sm"
        >
          <Pencil className="h-4 w-4" />
          <span>Edit</span>
        </Button>
      </CardHeader>
      <CardContent className="max-h-[500px] overflow-auto">
        {constraints.length === 0 ? (
          <Alert>
            <AlertTitle>No constraints</AlertTitle>
            <AlertDescription>
              This table has no CHECK constraints. Use “Edit” to add one.
              ClickHouse checks constraints on INSERT only.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left font-medium p-2">Name</th>
                  <th className="text-left font-medium p-2">CHECK expression</th>
                </tr>
              </thead>
              <tbody>
                {constraints.map((c) => (
                  <tr key={c.name} className="border-t">
                    <td className="p-2 font-mono">{c.name}</td>
                    <td className="p-2 font-mono">{c.expr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ConstraintsSection;
