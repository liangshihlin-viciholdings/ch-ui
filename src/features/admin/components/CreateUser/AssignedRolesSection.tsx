import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FormField, FormItem, FormControl } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

interface AssignedRolesSectionProps {
  form: any;
  allRoles: string[];
}

const AssignedRolesSection: React.FC<AssignedRolesSectionProps> = ({ form, allRoles }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Assigned Roles</CardTitle>
      </CardHeader>
      <CardContent>
        <FormField
          control={form.control}
          name="assignedRolesList"
          render={({ field }) => {
            const selected: string[] = field.value ?? [];

            const toggle = (role: string) => {
              const next = selected.includes(role)
                ? selected.filter((r) => r !== role)
                : [...selected, role];
              field.onChange(next);
            };

            return (
              <FormItem>
                <div className="space-y-2">
                  {allRoles.length === 0 && (
                    <p className="text-sm text-muted-foreground">No roles defined.</p>
                  )}
                  {allRoles.map((role) => (
                    <FormControl key={role}>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={selected.includes(role)}
                          onCheckedChange={() => toggle(role)}
                        />
                        <span className="text-sm">{role}</span>
                      </label>
                    </FormControl>
                  ))}
                </div>
                {selected.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {selected.map((r) => (
                      <Badge key={r} variant="secondary">{r}</Badge>
                    ))}
                  </div>
                )}
              </FormItem>
            );
          }}
        />
      </CardContent>
    </Card>
  );
};

export default AssignedRolesSection;
