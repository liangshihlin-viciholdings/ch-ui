import { useState } from "react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissionsState } from "./hooks/usePermissionsState";
import { LayerType } from "./types";
import { Users, Shield, Gauge, Filter, Settings, Grid3x3, Eye } from "lucide-react";
import useAppStore from "@/stores/workspaceStore";
import UsersLayer from "./UsersLayer";
import RolesLayer from "./RolesLayer";
import QuotasLayer from "./QuotasLayer";
import RowPoliciesLayer from "./RowPoliciesLayer";
import SettingsProfilesLayer from "./SettingsProfilesLayer";
import PermissionsMatrix from "./PermissionsMatrix";
import ReviewPanel from "./ReviewPanel";
import ExportImportDialog from "./ExportImportDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { toast } from "sonner";

/**
 * Main container for the comprehensive permissions configuration system
 */
export default function PermissionsConfig() {
  const { userPrivileges } = useAppStore();
  const permissionsState = usePermissionsState();
  const {
    pendingChanges,
    activeLayer,
    setActiveLayer,
    isReviewPanelOpen,
    toggleReviewPanel,
    addPendingChange,
    removePendingChange,
    clearPendingChanges,
    executePendingChanges,
    isExecuting,
    executionResults,
    executionProgress,
    currentExecutingChange,
  } = permissionsState;

  // Layer configurations with icons and privilege checks
  const layers: Array<{
    id: LayerType;
    label: string;
    icon: React.ReactNode;
    description: string;
    canAccess: boolean;
  }> = [
    {
      id: "users",
      label: "Users",
      icon: <Users className="w-4 h-4" />,
      description: "Manage user accounts and their grants",
      canAccess: userPrivileges?.canShowUsers || false,
    },
    {
      id: "roles",
      label: "Roles",
      icon: <Shield className="w-4 h-4" />,
      description: "Create and configure roles",
      canAccess: userPrivileges?.canShowRoles || false,
    },
    {
      id: "quotas",
      label: "Quotas",
      icon: <Gauge className="w-4 h-4" />,
      description: "Configure resource quotas",
      canAccess: userPrivileges?.canShowQuotas || false,
    },
    {
      id: "row_policies",
      label: "Row Policies",
      icon: <Filter className="w-4 h-4" />,
      description: "Row-level security filters",
      canAccess: userPrivileges?.canShowRowPolicies || false,
    },
    {
      id: "settings_profiles",
      label: "Settings Profiles",
      icon: <Settings className="w-4 h-4" />,
      description: "Default settings per user/role",
      canAccess: userPrivileges?.canShowSettingsProfiles || false,
    },
    {
      id: "matrix",
      label: "Permissions Matrix",
      icon: <Grid3x3 className="w-4 h-4" />,
      description: "Visual overview of permissions",
      canAccess: true, // Matrix is read-only, always accessible
    },
  ];

  // Filter layers based on user privileges
  const accessibleLayers = layers.filter((layer) => layer.canAccess);

  return (
    <div className="space-y-6" role="main" aria-label="Permissions Configuration">
      {/* Skip to content link for keyboard navigation */}
      <a
        href="#permissions-tabs"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
      >
        Skip to permissions tabs
      </a>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-medium mb-2" id="permissions-heading">
            Permissions Configuration
          </h2>
          <p className="text-gray-400" id="permissions-description">
            Comprehensive access management with granular control
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <ExportImportDialog />

          {/* Pending changes indicator with live region */}
          {pendingChanges.length > 0 && (
            <Button
              onClick={toggleReviewPanel}
              variant="default"
              size="lg"
              className="gap-2"
              aria-label={`Review ${pendingChanges.length} pending change${pendingChanges.length !== 1 ? "s" : ""}`}
              aria-describedby="pending-changes-count"
            >
              <Eye className="w-4 h-4" aria-hidden="true" />
              Review Changes
              <Badge
                variant="secondary"
                className="ml-1"
                id="pending-changes-count"
                aria-live="polite"
                aria-atomic="true"
              >
                {pendingChanges.length}
              </Badge>
            </Button>
          )}
        </div>
      </div>

      {/* No accessible layers warning */}
      {accessibleLayers.length === 0 && (
        <div
          className="border border-yellow-500/50 bg-yellow-500/10 rounded-md p-4"
          role="alert"
          aria-live="polite"
        >
          <p className="text-sm text-yellow-500">
            You don't have permissions to access any permission configuration layers.
            Contact your administrator for access.
          </p>
        </div>
      )}

      {/* Layer tabs */}
      {accessibleLayers.length > 0 && (
        <Tabs
          value={activeLayer}
          onValueChange={(value) => setActiveLayer(value as LayerType)}
          className="w-full"
          id="permissions-tabs"
          aria-labelledby="permissions-heading"
          aria-describedby="permissions-description"
        >
          <TabsList
            className="w-full justify-start overflow-x-auto"
            role="tablist"
            aria-label="Permission configuration layers"
          >
            {accessibleLayers.map((layer) => (
              <TabsTrigger
                key={layer.id}
                value={layer.id}
                className="gap-2"
                role="tab"
                aria-label={layer.label}
                aria-selected={activeLayer === layer.id}
                aria-controls={`panel-${layer.id}`}
              >
                {React.cloneElement(layer.icon as React.ReactElement, { "aria-hidden": true })}
                {layer.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Tab contents */}
          <TabsContent
            value="users"
            className="space-y-4"
            role="tabpanel"
            id="panel-users"
            aria-labelledby="tab-users"
          >
            <ErrorBoundary
              onError={(error, errorInfo) => {
                console.error("Users layer error:", {
                  layer: "users",
                  user: userPrivileges?.username || "unknown",
                  error: error.message,
                  stack: error.stack,
                  componentStack: errorInfo.componentStack,
                });
                toast.error("Failed to load Users layer. Please try again.");
              }}
            >
              <UsersLayer onAddChange={addPendingChange} />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent
            value="roles"
            className="space-y-4"
            role="tabpanel"
            id="panel-roles"
            aria-labelledby="tab-roles"
          >
            <ErrorBoundary
              onError={(error, errorInfo) => {
                console.error("Roles layer error:", {
                  layer: "roles",
                  user: userPrivileges?.username || "unknown",
                  error: error.message,
                  stack: error.stack,
                  componentStack: errorInfo.componentStack,
                });
                toast.error("Failed to load Roles layer. Please try again.");
              }}
            >
              <RolesLayer onAddChange={addPendingChange} />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent
            value="quotas"
            className="space-y-4"
            role="tabpanel"
            id="panel-quotas"
            aria-labelledby="tab-quotas"
          >
            <ErrorBoundary
              onError={(error, errorInfo) => {
                console.error("Quotas layer error:", {
                  layer: "quotas",
                  user: userPrivileges?.username || "unknown",
                  error: error.message,
                  stack: error.stack,
                  componentStack: errorInfo.componentStack,
                });
                toast.error("Failed to load Quotas layer. Please try again.");
              }}
            >
              <QuotasLayer onAddChange={addPendingChange} />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent
            value="row_policies"
            className="space-y-4"
            role="tabpanel"
            id="panel-row_policies"
            aria-labelledby="tab-row_policies"
          >
            <ErrorBoundary
              onError={(error, errorInfo) => {
                console.error("Row Policies layer error:", {
                  layer: "row_policies",
                  user: userPrivileges?.username || "unknown",
                  error: error.message,
                  stack: error.stack,
                  componentStack: errorInfo.componentStack,
                });
                toast.error("Failed to load Row Policies layer. Please try again.");
              }}
            >
              <RowPoliciesLayer onAddChange={addPendingChange} />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent
            value="settings_profiles"
            className="space-y-4"
            role="tabpanel"
            id="panel-settings_profiles"
            aria-labelledby="tab-settings_profiles"
          >
            <ErrorBoundary
              onError={(error, errorInfo) => {
                console.error("Settings Profiles layer error:", {
                  layer: "settings_profiles",
                  user: userPrivileges?.username || "unknown",
                  error: error.message,
                  stack: error.stack,
                  componentStack: errorInfo.componentStack,
                });
                toast.error("Failed to load Settings Profiles layer. Please try again.");
              }}
            >
              <SettingsProfilesLayer onAddChange={addPendingChange} />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent
            value="matrix"
            className="space-y-4"
            role="tabpanel"
            id="panel-matrix"
            aria-labelledby="tab-matrix"
          >
            <ErrorBoundary
              onError={(error, errorInfo) => {
                console.error("Permissions Matrix error:", {
                  layer: "matrix",
                  user: userPrivileges?.username || "unknown",
                  error: error.message,
                  stack: error.stack,
                  componentStack: errorInfo.componentStack,
                });
                toast.error("Failed to load Permissions Matrix. Please try again.");
              }}
            >
              <PermissionsMatrix />
            </ErrorBoundary>
          </TabsContent>
        </Tabs>
      )}

      {/* Review Panel */}
      <ReviewPanel
        isOpen={isReviewPanelOpen}
        changes={pendingChanges}
        isExecuting={isExecuting}
        executionResults={executionResults}
        executionProgress={executionProgress}
        currentExecutingChange={currentExecutingChange}
        onClose={toggleReviewPanel}
        onExecute={executePendingChanges}
        onRemoveChange={removePendingChange}
        onClearAll={clearPendingChanges}
      />
    </div>
  );
}
