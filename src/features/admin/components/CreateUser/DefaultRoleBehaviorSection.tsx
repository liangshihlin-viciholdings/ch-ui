import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  FormField,
  FormItem,
  FormControl,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

type DefaultRoleMode = "ALL" | "SPECIFIC" | "EXCEPT" | "NONE";

interface DefaultRoleBehaviorSectionProps {
  form: any;
  assignedRoles: string[];
}

const DefaultRoleBehaviorSection: React.FC<DefaultRoleBehaviorSectionProps> = ({
  form,
  assignedRoles,
}) => {
  const mode: DefaultRoleMode = form.watch("defaultRoleMode");

  const toggleRole = (fieldName: string, role: string, current: string[]) => {
    const next = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role];
    form.setValue(fieldName, next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default Role Behaviour</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Controls which assigned roles activate automatically at login.
        </p>

        <FormField
          control={form.control}
          name="defaultRoleMode"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="space-y-2"
                >
                  <label className="flex items-center gap-2 cursor-pointer">
                    <RadioGroupItem value="ALL" />
                    <span className="text-sm font-medium">ALL</span>
                    <span className="text-xs text-muted-foreground">— all assigned roles activate at login</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <RadioGroupItem value="SPECIFIC" />
                    <span className="text-sm font-medium">SPECIFIC</span>
                    <span className="text-xs text-muted-foreground">— only selected roles activate</span>
                  </label>

                  {mode === "SPECIFIC" && (
                    <FormField
                      control={form.control}
                      name="defaultRolesList"
                      render={({ field: listField }) => (
                        <div className="ml-6 space-y-1">
                          {assignedRoles.length === 0 && (
                            <p className="text-xs text-muted-foreground">No roles assigned yet.</p>
                          )}
                          {assignedRoles.map((role) => (
                            <label key={role} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox
                                checked={(listField.value ?? []).includes(role)}
                                onCheckedChange={() =>
                                  toggleRole("defaultRolesList", role, listField.value ?? [])
                                }
                              />
                              <span className="text-sm">{role}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    />
                  )}

                  <label className="flex items-center gap-2 cursor-pointer">
                    <RadioGroupItem value="EXCEPT" />
                    <span className="text-sm font-medium">ALL EXCEPT</span>
                    <span className="text-xs text-muted-foreground">— all assigned roles except selected</span>
                  </label>

                  {mode === "EXCEPT" && (
                    <FormField
                      control={form.control}
                      name="defaultRolesExcept"
                      render={({ field: exceptField }) => (
                        <div className="ml-6 space-y-1">
                          {assignedRoles.length === 0 && (
                            <p className="text-xs text-muted-foreground">No roles assigned yet.</p>
                          )}
                          {assignedRoles.map((role) => (
                            <label key={role} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox
                                checked={(exceptField.value ?? []).includes(role)}
                                onCheckedChange={() =>
                                  toggleRole("defaultRolesExcept", role, exceptField.value ?? [])
                                }
                              />
                              <span className="text-sm">{role}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    />
                  )}

                  <label className="flex items-center gap-2 cursor-pointer">
                    <RadioGroupItem value="NONE" />
                    <span className="text-sm font-medium">NONE</span>
                    <span className="text-xs text-muted-foreground">— no roles activate automatically</span>
                  </label>
                </RadioGroup>
              </FormControl>
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
};

export default DefaultRoleBehaviorSection;
