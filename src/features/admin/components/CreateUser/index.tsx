// components/CreateNewUser/index.tsx
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import useAppStore from "@/stores/workspaceStore";
import { format } from "date-fns";
import { generateRandomPassword } from "@/lib/utils";
import AuthenticationSection from "./AuthenticationSection";
import AccessControlSection from "./AccessControlSection";
import DatabaseRolesSection from "./DatabaseRolesSection";
import PrivilegesSection from "./PrivilegesSection";
import SettingsSection from "./SettingsSection";
import useMetadata from "./hooks/useMetadata";
import {
  GrantedPermission,
  findPermissionById,
  findParentId,
  formatScope,
} from "./PrivilegesSection/permissions";
import { PendingChange } from "../PermissionsConfig/types";

interface CreateNewUserProps {
  onBack: () => void;
  onUserCreated: () => void;
  onAddChange: (change: Omit<PendingChange, "id" | "createdAt">) => void;
}

const CreateNewUser: React.FC<CreateNewUserProps> = ({ onBack, onUserCreated, onAddChange }) => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [onCluster, setOnCluster] = useState(false);
  const [clusterName, setClusterName] = useState("");

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

  const metadata = useMetadata(true); // Always fetch roles, databases, profiles
  const { credential } = useAppStore();

  // Set cluster settings from credentials
  React.useEffect(() => {
    if (credential?.isDistributed && credential?.clusterName) {
      setOnCluster(true);
      setClusterName(credential.clusterName);
    }
  }, [credential]);

  const onSubmit = async (data: any) => {
    try {
      setError("");
      setLoading(true);

      // Collect all SQL statements
      const statements: string[] = [];

      // Add user creation statement
      statements.push(buildUserCreationQuery(data));

      // Add grant statements
      const grantQueries = buildGrantQueries(data.username, data);
      statements.push(...grantQueries);

      // Add readonly setting if enabled
      if (data.settings.readonly) {
        statements.push(`ALTER USER ${data.username} SETTINGS READONLY=1`);
      }

      // Stage the change instead of executing
      onAddChange({
        type: "CREATE",
        entityType: "USER",
        entityName: data.username,
        description: `Create user ${data.username}`,
        sqlStatements: statements,
        originalState: undefined,
        newState: { ...data },
      });

      toast.info(`User creation for ${data.username} staged for review`);
      form.reset();
      onBack();
    } catch (err: any) {
      setError(err.message || "Failed to stage user creation");
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePassword = () => {
    const newPassword = generateRandomPassword();
    form.setValue("password", newPassword);
  };

  const buildUserCreationQuery = (data: any) => {
    let query = `CREATE USER IF NOT EXISTS ${data.username}`;
    
    // Add ON CLUSTER if enabled
    if (onCluster && clusterName) {
      query += ` ON CLUSTER ${clusterName}`;
    }

    // Add authentication
    query += ` IDENTIFIED WITH sha256_password BY '${data.password}'`;

    // Add host restrictions if specified
    if (data.hostType !== "ANY") {
      query += ` HOST ${data.hostType} '${data.hostValue}'`;
    }

    // Add validity period if specified
    if (data.validUntil) {
      query += ` VALID UNTIL '${formatDate(data.validUntil)}'`;
    }

    // Add default role if specified
    if (data.defaultRole) {
      query += ` DEFAULT ROLE ${data.defaultRole}`;
    }

    // Add default database if specified
    if (data.defaultDatabase) {
      query += ` DEFAULT DATABASE ${data.defaultDatabase}`;
    }

    // Add grantees setting
    query += ` GRANTEES ${data.grantees}`;

    // Add settings profile and readonly mode if specified
    if (data.settings.profile) {
      query += ` SETTINGS PROFILE '${data.settings.profile}'`;
    }
    if (data.settings.readonly) {
      query += ` SETTINGS READONLY=1`;
    }

    return query;
  };

  const buildGrantQueries = (username: string, data: any) => {
    const queries: string[] = [];

    // Use hierarchical grants from privileges panel or presets
    const grants: GrantedPermission[] = data.privileges.grants || [];
    if (grants.length > 0) {
      // Create a map of granted permission IDs for quick lookup
      const grantedIds = new Set(grants.map(g => g.permissionId));

      // Track which privileges we've already granted to avoid duplicates
      const grantedSet = new Set<string>();

      for (const grant of grants) {
        const permission = findPermissionById(grant.permissionId);
        if (!permission) continue;

        // Skip if this permission's parent is also granted
        // (parent privileges automatically include their children in ClickHouse)
        const parentId = findParentId(grant.permissionId);
        if (parentId && grantedIds.has(parentId)) {
          continue; // Parent will cover this permission
        }

        const scopeStr = formatScope(grant.scope);
        const grantKey = `${permission.sqlPrivilege}:${scopeStr}`;

        // Skip if already granted
        if (grantedSet.has(grantKey)) continue;
        grantedSet.add(grantKey);

        // Generate individual GRANT statement for each permission
        // This avoids issues with mixing incompatible privileges
        queries.push(
          `GRANT ${permission.sqlPrivilege} ON ${scopeStr} TO ${username}`
        );
      }

      return queries;
    }

    // If no grants specified, return empty array
    return queries;
  };

  const formatDate = (date: Date) => {
    return format(date, "yyyy-MM-dd HH:mm:ss");
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 pb-8">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={onBack}
        className="mb-2 gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Users & Roles
      </Button>

      {/* Title */}
      <h1 className="text-3xl font-medium mb-2">Create New ClickHouse User</h1>
      <p className="text-gray-400 mb-4">
        Configure authentication, permissions, and settings for the new user.
      </p>

      {/* Form Container */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs defaultValue="general" className="w-full">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="privileges">Privileges</TabsTrigger>
            </TabsList>

            <TabsContent value="general" forceMount className="data-[state=inactive]:hidden">
              <div className="grid grid-cols-2 gap-6">
                {/* Authentication Section */}
                <AuthenticationSection
                  form={form}
                  handleGeneratePassword={handleGeneratePassword}
                />

                {/* Access Control Section */}
                <AccessControlSection form={form} />

                {/* Left column: Database & Roles + Cluster Settings */}
                <div className="space-y-6">
                  {/* Database and Roles Section */}
                  <DatabaseRolesSection
                    form={form}
                    roles={metadata.roles}
                    databases={metadata.databases}
                  />

                  {/* ON CLUSTER Settings */}
                  <div className="space-y-4 border rounded-lg p-4">
                    <h3 className="text-lg font-semibold">Cluster Settings</h3>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="onCluster"
                        checked={onCluster}
                        onCheckedChange={(checked) => setOnCluster(!!checked)}
                      />
                      <Label htmlFor="onCluster">Create user on cluster</Label>
                    </div>

                    {onCluster && (
                      <div className="space-y-2">
                        <Label htmlFor="clusterName">Cluster Name</Label>
                        <Input
                          id="clusterName"
                          value={clusterName}
                          onChange={(e) => setClusterName(e.target.value)}
                          placeholder="Enter cluster name"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Settings Section */}
                <SettingsSection form={form} profiles={metadata.profiles} />
              </div>
            </TabsContent>

            <TabsContent value="privileges" forceMount className="data-[state=inactive]:hidden">
              <PrivilegesSection
                form={form}
                databases={metadata.databases}
                tables={metadata.tables}
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
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Staging..." : "Stage User Creation"}
          </Button>
        </form>
      </Form>
    </div>
  );
};

export default CreateNewUser;
