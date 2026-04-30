import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import useAppStore from "@/stores/workspaceStore";
import AuthenticationSection from "./AuthenticationSection";
import AccessControlSection from "./AccessControlSection";
import AssignedRolesSection from "./AssignedRolesSection";
import DefaultRoleBehaviorSection from "./DefaultRoleBehaviorSection";
import PrivilegesSection from "./PrivilegesSection";
import SettingsSection from "./SettingsSection";
import useMetadata from "./hooks/useMetadata";
import { useUserData } from "./hooks/useUserData";
import { useGrants } from "../PermissionsConfig/hooks/useGrants";
import { useEffectiveGrants } from "../PermissionsConfig/hooks/useEffectiveGrants";
import { useSqlGenerator } from "../PermissionsConfig/hooks/useSqlGenerator";
import {
  GrantedPermission,
  findPermissionById,
  findParentId,
  formatScope,
} from "./PrivilegesSection/permissions";
import { Skeleton } from "@/components/ui/skeleton";
import { PendingChange } from "../PermissionsConfig/types";

type DefaultRoleMode = "ALL" | "SPECIFIC" | "EXCEPT" | "NONE";

function deriveDefaultRoleMode(userInfo: {
  default_roles_all: number;
  default_roles_list?: string[];
  default_roles_except?: string[];
}): DefaultRoleMode {
  if (userInfo.default_roles_all === 1) return "ALL";
  if ((userInfo.default_roles_list?.length ?? 0) > 0) return "SPECIFIC";
  if ((userInfo.default_roles_except?.length ?? 0) > 0) return "EXCEPT";
  return "NONE";
}

interface EditUserProps {
  username: string;
  onBack: () => void;
  onUserUpdated: () => void;
  onAddChange: (change: Omit<PendingChange, "id" | "createdAt">) => void;
}

const EditUser: React.FC<EditUserProps> = ({
  username,
  onBack,
  onUserUpdated,
  onAddChange,
}) => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
      hostType: "ANY",
      hostValue: "",
      validUntil: undefined,
      assignedRolesList: [] as string[],
      defaultRoleMode: "ALL" as "ALL" | "SPECIFIC" | "EXCEPT" | "NONE",
      defaultRolesList: [] as string[],
      defaultRolesExcept: [] as string[],
      defaultDatabase: "",
      grantees: "NONE",
      settings: {
        profile: "",
        readonly: false,
      },
      privileges: {
        grants: [] as GrantedPermission[],
      },
    },
  });

  const metadata = useMetadata(true);
  const { userInfo, loading: userLoading } = useUserData({ username });
  const {
    directGrants,
    assignedRoles,
    effectiveGrants,
    loading: grantsLoading,
  } = useEffectiveGrants(username);
  const { generateAlterUser, generateGrant, generateRevoke } =
    useSqlGenerator();

  // Populate form when user data is loaded
  useEffect(() => {
    if (userInfo && directGrants) {
      let hostType = "ANY";
      let hostValue = "";

      if (userInfo.host_ip?.length > 0) {
        hostType = "IP";
        hostValue = userInfo.host_ip.join(", ");
      } else if (userInfo.host_names?.length > 0) {
        hostType = "NAME";
        hostValue = userInfo.host_names.join(", ");
      } else if (userInfo.host_names_regexp?.length > 0) {
        hostType = "REGEXP";
        hostValue = userInfo.host_names_regexp.join(", ");
      } else if (userInfo.host_names_like?.length > 0) {
        hostType = "LIKE";
        hostValue = userInfo.host_names_like.join(", ");
      }

      const grantees = userInfo.grantees_any === 1 ? "ANY" : "NONE";

      const defaultRoleMode = deriveDefaultRoleMode(userInfo);

      form.reset({
        username: userInfo.name,
        password: "",
        hostType,
        hostValue,
        validUntil: undefined,
        assignedRolesList: assignedRoles.map((r) => r.roleName),
        defaultRoleMode,
        defaultRolesList: userInfo.default_roles_list ?? [],
        defaultRolesExcept: userInfo.default_roles_except ?? [],
        defaultDatabase: userInfo.default_database || "",
        grantees,
        settings: {
          profile: userInfo.settings?.profile || "",
          readonly: userInfo.settings?.readonly || false,
        },
        privileges: {
          grants: directGrants,
        },
      });
    }
  }, [userInfo, directGrants]);

  const onSubmit = async (data: any) => {
    if (!username) return;

    try {
      setError("");
      setLoading(true);

      const statements: string[] = [];
      const q = (id: string) => `\`${id.replace(/`/g, "``")}\``;

      // 1. Handle password change (only if provided)
      if (data.password) {
        statements.push(
          ...generateAlterUser(username, { password: data.password }),
        );
      }

      // 2. Handle host changes
      if (userInfo) {
        const currentHostType = getHostType(userInfo);
        const currentHostValue = getHostValue(userInfo);

        if (
          data.hostType !== currentHostType ||
          data.hostValue !== currentHostValue
        ) {
          const hostChanges: any = {};

          if (data.hostType === "IP" && data.hostValue) {
            hostChanges.hostIp = data.hostValue
              .split(",")
              .map((ip: string) => ip.trim());
          } else if (data.hostType === "NAME" && data.hostValue) {
            hostChanges.hostNames = data.hostValue
              .split(",")
              .map((name: string) => name.trim());
          }

          statements.push(...generateAlterUser(username, hostChanges));
        }
      }

      // 3. Handle default database change
      const currentDefaultDb = data.defaultDatabase || "";
      const originalDefaultDb = userInfo?.default_database || "";
      if (currentDefaultDb !== originalDefaultDb) {
        const dbValue = currentDefaultDb || undefined;
        statements.push(
          ...generateAlterUser(username, {
            defaultDatabase: dbValue,
          }),
        );
      }

      // 4. Handle settings changes
      const currentProfile = data.settings.profile || "";
      const originalProfile = userInfo?.settings?.profile || "";
      if (currentProfile !== originalProfile && currentProfile !== "") {
        statements.push(
          `ALTER USER ${username} SETTINGS PROFILE '${currentProfile}'`,
        );
      }

      if (data.settings.readonly !== userInfo?.settings?.readonly) {
        const readonlyValue = data.settings.readonly ? 1 : 0;
        statements.push(
          `ALTER USER ${username} SETTINGS READONLY=${readonlyValue}`,
        );
      }

      // 5. Handle grantees change
      const currentGrantees = userInfo?.grantees_any === 1 ? "ANY" : "NONE";
      if (data.grantees !== currentGrantees) {
        statements.push(`ALTER USER ${username} GRANTEES ${data.grantees}`);
      }

      // 6. Handle assigned-role changes (GRANT / REVOKE)
      const originalAssigned = assignedRoles.map((r) => r.roleName);
      const newAssigned: string[] = data.assignedRolesList ?? [];

      const rolesToGrant = newAssigned.filter((r) => !originalAssigned.includes(r));
      const rolesToRevoke = originalAssigned.filter((r) => !newAssigned.includes(r));

      rolesToGrant.forEach((r) => statements.push(`GRANT ${q(r)} TO ${username}`));
      rolesToRevoke.forEach((r) => statements.push(`REVOKE ${q(r)} FROM ${username}`));

      // 7. Handle default-role-behaviour changes
      const originalMode = userInfo ? deriveDefaultRoleMode(userInfo) : "NONE";

      const originalSpecific = [...(userInfo?.default_roles_list ?? [])].sort().join(",");
      const originalExcept = [...(userInfo?.default_roles_except ?? [])].sort().join(",");
      const newSpecific = [...(data.defaultRolesList ?? [])].sort().join(",");
      const newExcept = [...(data.defaultRolesExcept ?? [])].sort().join(",");

      const defaultRoleChanged =
        data.defaultRoleMode !== originalMode ||
        (data.defaultRoleMode === "SPECIFIC" && newSpecific !== originalSpecific) ||
        (data.defaultRoleMode === "EXCEPT" && newExcept !== originalExcept);

      if (defaultRoleChanged) {
        switch (data.defaultRoleMode) {
          case "ALL":
            statements.push(`ALTER USER ${username} DEFAULT ROLE ALL`);
            break;
          case "SPECIFIC": {
            const roles = (data.defaultRolesList ?? []).map(q).join(", ");
            if (roles) {
              statements.push(`ALTER USER ${username} DEFAULT ROLE ${roles}`);
            } else {
              statements.push(`ALTER USER ${username} DEFAULT ROLE NONE`);
            }
            break;
          }
          case "EXCEPT": {
            const except = (data.defaultRolesExcept ?? []).map(q).join(", ");
            if (except) {
              statements.push(`ALTER USER ${username} DEFAULT ROLE ALL EXCEPT ${except}`);
            } else {
              statements.push(`ALTER USER ${username} DEFAULT ROLE ALL`);
            }
            break;
          }
          case "NONE":
            statements.push(`ALTER USER ${username} DEFAULT ROLE NONE`);
            break;
        }
      }

      // 8. Handle permission changes — diff original vs new grants
      const originalGrants: GrantedPermission[] = directGrants || [];
      const newGrants: GrantedPermission[] = data.privileges.grants || [];

      // Create maps for quick lookup
      const originalGrantsMap = new Map(
        originalGrants.map((g: GrantedPermission) => [
          `${g.permissionId}:${JSON.stringify(g.scope)}`,
          g,
        ]),
      );
      const newGrantsMap = new Map(
        newGrants.map((g: GrantedPermission) => [
          `${g.permissionId}:${JSON.stringify(g.scope)}`,
          g,
        ]),
      );

      // Find revoked permissions (in original but not in new)
      for (const [key, grant] of originalGrantsMap) {
        if (!newGrantsMap.has(key)) {
          const permission = findPermissionById(grant.permissionId);
          if (permission) {
            statements.push(generateRevoke(permission, grant.scope, username));
          }
        }
      }

      // Find new permissions (in new but not in original)
      const grantedIds = new Set(newGrants.map((g) => g.permissionId));
      for (const [key, grant] of newGrantsMap) {
        if (!originalGrantsMap.has(key)) {
          const permission = findPermissionById(grant.permissionId);
          if (!permission) continue;

          // Skip if parent is also granted
          const parentId = findParentId(grant.permissionId);
          if (parentId && grantedIds.has(parentId)) {
            continue;
          }

          statements.push(generateGrant(permission, grant.scope, username));
        }
      }

      // Stage all changes instead of executing
      if (statements.length === 0) {
        toast.info("No changes detected");
        return;
      }

      onAddChange({
        type: "ALTER",
        entityType: "USER",
        entityName: username,
        description: `Update user ${username}`,
        sqlStatements: statements,
        originalState: { userInfo, grants: directGrants },
        newState: { ...data },
      });

      toast.success(`Changes for user ${username} staged for review`);
    } catch (err: any) {
      setError(err.message || "Failed to stage user update");
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePassword = () => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    const newPassword = Array.from({ length: 16 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length)),
    ).join("");
    form.setValue("password", newPassword);
  };

  const getHostType = (userInfo: any) => {
    if (userInfo.host_ip?.length > 0) return "IP";
    if (userInfo.host_names?.length > 0) return "NAME";
    if (userInfo.host_names_regexp?.length > 0) return "REGEXP";
    if (userInfo.host_names_like?.length > 0) return "LIKE";
    return "ANY";
  };

  const getHostValue = (userInfo: any) => {
    if (userInfo.host_ip?.length > 0) return userInfo.host_ip.join(", ");
    if (userInfo.host_names?.length > 0) return userInfo.host_names.join(", ");
    if (userInfo.host_names_regexp?.length > 0)
      return userInfo.host_names_regexp.join(", ");
    if (userInfo.host_names_like?.length > 0)
      return userInfo.host_names_like.join(", ");
    return "";
  };

  const isLoading = userLoading || grantsLoading;

  return (
    <div className="w-full max-w-7xl mx-auto px-3 pb-8">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={onBack}
        className="mb-2 gap-2 cursor-pointer hover:accent-accent-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Users & Roles
      </Button>

      {/* Title */}
      <h1 className="text-3xl font-medium mb-2">Edit User: {username}</h1>
      <p className="text-gray-400 mb-4">
        Modify authentication, permissions, and settings for this user.
      </p>

      {/* Form Container */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="general" className="w-full">
              <TabsList>
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="privileges">Privileges</TabsTrigger>
              </TabsList>

              <TabsContent value="general" forceMount className="data-[state=inactive]:hidden">
                <div className="grid grid-cols-2 gap-6">
                  {/* Authentication Section - with edit mode */}
                  <AuthenticationSection
                    form={form}
                    handleGeneratePassword={handleGeneratePassword}
                    isEditMode={true}
                  />

                  {/* Access Control Section */}
                  <AccessControlSection form={form} />

                  {/* Assigned Roles */}
                  <AssignedRolesSection
                    form={form}
                    allRoles={metadata.roles}
                  />

                  {/* Default Role Behaviour */}
                  <DefaultRoleBehaviorSection
                    form={form}
                    assignedRoles={form.watch("assignedRolesList")}
                  />

                  {/* Default Database */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Default Database</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FormField
                        control={form.control}
                        name="defaultDatabase"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Default Database</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select default database" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {metadata.databases.map((db) => (
                                  <SelectItem key={db} value={db}>
                                    {db}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  {/* Settings Section */}
                  <SettingsSection form={form} profiles={metadata.profiles} />
                </div>
              </TabsContent>

              <TabsContent value="privileges" forceMount className="data-[state=inactive]:hidden">
                <PrivilegesSection
                  form={form}
                  databases={metadata.databases}
                  tables={metadata.tables}
                  effectiveGrants={effectiveGrants}
                  assignedRoles={assignedRoles}
                  showRoleSource={true}
                />
              </TabsContent>
            </Tabs>

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? "Staging..." : "Stage User Update"}
            </Button>
          </form>
        </Form>
      )}
    </div>
  );
};

export default EditUser;
