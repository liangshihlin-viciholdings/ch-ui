import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import useAppStore from "@/stores/workspaceStore";
import AuthenticationSection from "./AuthenticationSection";
import AccessControlSection from "./AccessControlSection";
import DatabaseRolesSection from "./DatabaseRolesSection";
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
      defaultRole: "",
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
      // Determine host type and value
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

      // Determine grantees
      const grantees = userInfo.grantees_any === 1 ? "ANY" : "NONE";

      form.reset({
        username: userInfo.name,
        password: "", // Don't populate password for security
        hostType,
        hostValue,
        validUntil: undefined,
        defaultRole: userInfo.default_roles_list?.[0] || "",
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

      // 6. Handle default role change
      const currentDefaultRole = data.defaultRole || "";
      const originalDefaultRole = userInfo?.default_roles_list?.[0] || "";
      if (currentDefaultRole !== originalDefaultRole) {
        if (currentDefaultRole) {
          const isAlreadyAssigned = assignedRoles.some((r) => r.roleName === currentDefaultRole);
          if (!isAlreadyAssigned) {
            statements.push(`GRANT ${currentDefaultRole} TO ${username}`);
          }
          statements.push(`ALTER USER ${username} DEFAULT ROLE ${currentDefaultRole}`);
        } else {
          statements.push(`ALTER USER ${username} DEFAULT ROLE NONE`);
        }
      }

      // 7. Handle permission changes - diff original vs new grants
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

                  {/* Database and Roles Section */}
                  <DatabaseRolesSection
                    form={form}
                    roles={metadata.roles}
                    databases={metadata.databases}
                  />

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
