import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import UserTable from "@/features/admin/components/UserManagement/index";
import RoleManagement from "@/features/admin/components/RoleManagement";
import { InfoIcon, ShieldCheck, FileText } from "lucide-react";
import InfoDialog from "@/components/common/InfoDialog";
import AuditLogViewer from "@/features/admin/components/PermissionsConfig/AuditLogViewer";
import SettingsProfilesLayer from "@/features/admin/components/PermissionsConfig/SettingsProfilesLayer";
import ReviewPanel from "@/features/admin/components/PermissionsConfig/ReviewPanel";
import { usePermissionsState } from "@/features/admin/components/PermissionsConfig/hooks/usePermissionsState";
import useAppStore from "@/stores/workspaceStore";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function Admin() {
  const { userPrivileges } = useAppStore();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("users");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Use permissions state for staging changes
  const permissionsState = usePermissionsState();
  const {
    pendingChanges,
    isReviewPanelOpen,
    isExecuting,
    executionResults,
    executionProgress,
    currentExecutingChange,
    addPendingChange,
    removePendingChange,
    clearPendingChanges,
    toggleReviewPanel,
    executePendingChanges,
  } = permissionsState;

  // Check if user can view users/roles section
  const canViewUsersRoles = userPrivileges?.canShowUsers || userPrivileges?.canShowRoles;

  // Refresh data after successful execution
  const handleExecuteChanges = async () => {
    const results = await executePendingChanges();
    const allSucceeded = results.every((r) => r.success);
    if (allSucceeded && results.length > 0) {
      // Trigger data refresh
      setRefreshTrigger((prev) => prev + 1);
    }
  };

  return (
    <ErrorBoundary>
      <div className="max-h-screen w-full overflow-y-auto">
        <div className="container mx-auto p-6">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-medium mb-2 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6" />
              Administration
              <span
                onClick={() => setIsInfoOpen(true)}
                className="text-xs bg-purple-500/40 border border-purple-500 text-purple-600 px-2 py-1 rounded-md cursor-pointer flex items-center gap-1"
              >
                ALPHA <InfoIcon className="w-4 h-4" />
              </span>
            </h1>
            {pendingChanges.length > 0 && (
              <Button
                onClick={toggleReviewPanel}
                variant="destructive"
                className="gap-2"
              >
                <FileText className="w-4 h-4" />
                Review Changes
                <Badge variant="secondary">{pendingChanges.length}</Badge>
              </Button>
            )}
          </div>
        </div>

        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="w-64">
            <nav className="space-y-2">
              {canViewUsersRoles && (
                <Button
                  variant="ghost"
                  className={`w-full justify-start ${
                    activeSection === "users" ? "" : "text-gray-400"
                  } hover:bg-muted/50`}
                  onClick={() => setActiveSection("users")}
                >
                  Users
                </Button>
              )}
              {canViewUsersRoles && (
                <Button
                  variant="ghost"
                  className={`w-full justify-start ${
                    activeSection === "roles" ? "" : "text-gray-400"
                  } hover:bg-muted/50`}
                  onClick={() => setActiveSection("roles")}
                >
                  Roles
                </Button>
              )}
              {canViewUsersRoles && (
                <Button
                  variant="ghost"
                  className={`w-full justify-start ${
                    activeSection === "settings-profiles" ? "" : "text-gray-400"
                  } hover:bg-muted/50`}
                  onClick={() => setActiveSection("settings-profiles")}
                >
                  Settings Profiles
                </Button>
              )}
              {canViewUsersRoles && (
                <Button
                  variant="ghost"
                  className={`w-full justify-start ${
                    activeSection === "audit" ? "" : "text-gray-400"
                  } hover:bg-muted/50`}
                  onClick={() => setActiveSection("audit")}
                >
                  Audit Log
                </Button>
              )}
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <div className="space-y-6">
              {activeSection === "users" && (
                <div>
                  <UserTable
                    onAddChange={addPendingChange}
                    refreshTrigger={refreshTrigger}
                  />
                </div>
              )}

              {activeSection === "roles" && (
                <div>
                  <RoleManagement onAddChange={addPendingChange} refreshTrigger={refreshTrigger} />
                </div>
              )}

              {activeSection === "settings-profiles" && (
                <div>
                  <SettingsProfilesLayer onAddChange={addPendingChange} />
                </div>
              )}

              {activeSection === "audit" && (
                <div>
                  <AuditLogViewer />
                </div>
              )}
            </div>
          </div>
        </div>

        <InfoDialog
          title="Administration Page"
          isOpen={isInfoOpen}
          onClose={() => setIsInfoOpen(false)}
          variant="info"
        >
          <div className="flex flex-col gap-2">
            <ul className="list-disc list-inside">
              <li>Here you can manage users, roles, and settings.</li>
              <li className="text-sm">
                This page is only accessible to administrators.
              </li>
              <li>
                All the actions you take here run queries directly on your
                ClickHouse system database, be aware that those can be{" "}
                <strong className="text-red-500">irreversible.</strong>
              </li>
            </ul>
            <p className="text-xs font-bold">
              This is an <span className="text-purple-500">ALPHA</span> feature
              and is subject to change.
            </p>
          </div>
        </InfoDialog>

        {/* Review Panel */}
        <ReviewPanel
          isOpen={isReviewPanelOpen}
          changes={pendingChanges}
          isExecuting={isExecuting}
          executionResults={executionResults}
          executionProgress={executionProgress}
          currentExecutingChange={currentExecutingChange}
          onClose={toggleReviewPanel}
          onExecute={handleExecuteChanges}
          onRemoveChange={removePendingChange}
          onClearAll={clearPendingChanges}
        />
        </div>
      </div>
    </ErrorBoundary>
  );
}
