import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useAppStore from "@/stores/workspaceStore";

interface RowPolicyData {
  name: string;
  database: string;
  table: string;
  id: string;
  is_restrictive: number;
  filter_using: string;
}

interface RowPolicyEditorProps {
  policy: RowPolicyData | null;
  onClose: () => void;
  onAddChange: (change: any) => void;
}

export default function RowPolicyEditor({
  policy,
  onClose,
  onAddChange,
}: RowPolicyEditorProps) {
  const { dataBaseExplorer } = useAppStore();
  const isNewPolicy = !policy || !policy.name;

  // Form state
  const [policyName, setPolicyName] = useState(policy?.name || "");
  const [database, setDatabase] = useState(policy?.database || "");
  const [table, setTable] = useState(policy?.table || "");
  const [isRestrictive, setIsRestrictive] = useState(
    policy?.is_restrictive === 1 ? "restrictive" : "permissive"
  );
  const [filterClause, setFilterClause] = useState(policy?.filter_using || "");

  const databases = dataBaseExplorer.map((db) => db.name);
  const tables = database
    ? dataBaseExplorer.find((db) => db.name === database)?.children.map((t) => t.name) || []
    : [];

  const handleSave = () => {
    if (!policyName.trim() || !database || !table || !filterClause.trim()) {
      return;
    }

    const policyType = isRestrictive === "restrictive" ? "AS RESTRICTIVE" : "AS PERMISSIVE";

    if (isNewPolicy) {
      // Create new row policy
      const sql = `CREATE ROW POLICY ${policyName} ON ${database}.${table} ${policyType} FOR SELECT USING ${filterClause}`;

      onAddChange({
        type: "CREATE",
        entityType: "ROW_POLICY",
        entityName: `${policyName} ON ${database}.${table}`,
        description: `Create row policy ${policyName} on ${database}.${table}`,
        sqlStatements: [sql],
        originalState: null,
        newState: {
          policyName,
          database,
          table,
          isRestrictive,
          filterClause,
        },
      });
    } else {
      // For ALTER, drop and recreate
      const dropSql = `DROP ROW POLICY ${policyName} ON ${database}.${table}`;
      const createSql = `CREATE ROW POLICY ${policyName} ON ${database}.${table} ${policyType} FOR SELECT USING ${filterClause}`;

      onAddChange({
        type: "ALTER",
        entityType: "ROW_POLICY",
        entityName: `${policyName} ON ${database}.${table}`,
        description: `Update row policy ${policyName} on ${database}.${table}`,
        sqlStatements: [dropSql, createSql],
        originalState: policy,
        newState: {
          filterClause,
          isRestrictive,
        },
      });
    }

    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {isNewPolicy
              ? "Create New Row Policy"
              : `Edit Row Policy: ${policy?.name}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Policy name */}
          <div className="space-y-2">
            <Label htmlFor="policyName">Policy Name</Label>
            <Input
              id="policyName"
              value={policyName}
              onChange={(e) => setPolicyName(e.target.value)}
              disabled={!isNewPolicy}
              placeholder="Enter policy name (e.g., tenant_filter)"
            />
          </div>

          {/* Database and table */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="database">Database</Label>
              <Select
                value={database}
                onValueChange={(value) => {
                  setDatabase(value);
                  setTable(""); // Reset table when database changes
                }}
                disabled={!isNewPolicy}
              >
                <SelectTrigger id="database">
                  <SelectValue placeholder="Select database" />
                </SelectTrigger>
                <SelectContent>
                  {databases.map((db) => (
                    <SelectItem key={db} value={db}>
                      {db}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="table">Table</Label>
              <Select
                value={table}
                onValueChange={setTable}
                disabled={!isNewPolicy || !database}
              >
                <SelectTrigger id="table">
                  <SelectValue placeholder="Select table" />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((tbl) => (
                    <SelectItem key={tbl} value={tbl}>
                      {tbl}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Policy type */}
          <div className="space-y-2">
            <Label htmlFor="policyType">Policy Type</Label>
            <Select value={isRestrictive} onValueChange={setIsRestrictive}>
              <SelectTrigger id="policyType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="permissive">
                  Permissive (OR with other policies)
                </SelectItem>
                <SelectItem value="restrictive">
                  Restrictive (AND with other policies)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Permissive policies are combined with OR. Restrictive policies are combined
              with AND.
            </p>
          </div>

          {/* Filter clause */}
          <div className="space-y-2">
            <Label htmlFor="filterClause">Filter Clause (USING)</Label>
            <Textarea
              id="filterClause"
              value={filterClause}
              onChange={(e) => setFilterClause(e.target.value)}
              placeholder="e.g., tenant_id = currentUser()"
              rows={4}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              SQL expression that evaluates to true/false for each row. Use column names
              from the table.
            </p>
          </div>

          {/* Examples */}
          <div className="border-l-4 border-green-500 bg-green-500/10 p-4">
            <h4 className="text-sm font-medium mb-2">Examples:</h4>
            <ul className="text-xs space-y-1 font-mono text-muted-foreground">
              <li>• tenant_id = currentUser()</li>
              <li>• department = 'sales'</li>
              <li>• created_at &gt;= today() - INTERVAL 30 DAY</li>
              <li>• is_public = 1 OR owner = currentUser()</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!filterClause.trim()}>
            {isNewPolicy ? "Stage Create" : "Stage Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
