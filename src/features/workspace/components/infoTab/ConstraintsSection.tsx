import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { parseClickHouseConstraints } from "@/lib/schema-ddl/clickhouse";

interface ConstraintsSectionProps {
  /** The table's CREATE TABLE statement (system.tables.create_table_query). */
  createTableQuery: string;
}

// ClickHouse has no system.constraints table, so CHECK constraints are parsed
// from the table's CREATE statement (already fetched by InfoTab). Constraints
// are validated on INSERT only — they are not enforced on existing rows.
const ConstraintsSection: React.FC<ConstraintsSectionProps> = ({
  createTableQuery,
}) => {
  const constraints = React.useMemo(
    () => parseClickHouseConstraints(createTableQuery ?? ""),
    [createTableQuery],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Constraints</CardTitle>
      </CardHeader>
      <CardContent className="max-h-[500px] overflow-auto">
        {constraints.length === 0 ? (
          <Alert>
            <AlertTitle>No constraints</AlertTitle>
            <AlertDescription>
              This table has no CHECK constraints. Use “Edit Schema” on the table
              to add one. ClickHouse checks constraints on INSERT only.
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
