// src/features/connections/components/ConnectionManager.tsx
// Connection Manager component for managing saved connections

import { useEffect, useState } from "react";
import {
  Database,
  Plus,
  Trash2,
  Edit,
  Star,
  StarOff,
  Download,
  Loader2,
  Plug,
  PlugZap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useConnectionStore } from "@/stores/connectionStore";
import useAppStore from "@/stores/workspaceStore";
import { ConnectionDisplay } from "@/lib/db";
import ConnectionForm from "./ConnectionForm";
import ExportImportDialog from "./ExportImportDialog";

export default function ConnectionManager() {
  const {
    connections,
    activeConnectionId,
    isLoading,
    error,
    loadConnections,
    deleteConnectionById,
    setActiveConnection,
    setAsDefault,
    clearError,
  } = useConnectionStore();

  const { setCredential, checkServerStatus, isServerAvailable } = useAppStore();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ConnectionDisplay | null>(null);
  const [deletingConnection, setDeletingConnection] = useState<ConnectionDisplay | null>(null);
  const [showExportImport, setShowExportImport] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const handleConnect = async (connection: ConnectionDisplay) => {
    setConnectingId(connection.id);

    try {
      await setCredential({
        url: connection.url,
        username: connection.username,
        password: connection.password,
        useAdvanced: connection.useAdvanced,
        customPath: connection.customPath,
        requestTimeout: connection.requestTimeout,
        isDistributed: connection.isDistributed,
        clusterName: connection.clusterName,
      });

      await checkServerStatus();
      setActiveConnection(connection.id);
      toast.success(`Connected to ${connection.name}`);
    } catch (err) {
      toast.error("Failed to connect: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setConnectingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingConnection) return;

    const success = await deleteConnectionById(deletingConnection.id);
    if (success) {
      toast.success(`Deleted ${deletingConnection.name}`);
    }
    setDeletingConnection(null);
  };

  const handleSetDefault = async (connection: ConnectionDisplay) => {
    const success = await setAsDefault(connection.id);
    if (success) {
      toast.success(`${connection.name} set as default`);
    }
  };

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Saved Connections
              </CardTitle>
              <CardDescription>
                Manage your ClickHouse connections
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExportImport(true)}
              >
                <Download className="h-4 w-4 mr-1" />
                Export/Import
              </Button>
              <Button size="sm" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Connection
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : connections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Database className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                No saved connections yet
              </p>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Connection
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {connections.map((conn) => (
                  <div
                    key={conn.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      activeConnectionId === conn.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-md ${
                          activeConnectionId === conn.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {activeConnectionId === conn.id ? (
                          <PlugZap className="h-4 w-4" />
                        ) : (
                          <Plug className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{conn.name}</span>
                          {conn.isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              Default
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground font-mono">
                          {conn.username}@{new URL(conn.url).host}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {activeConnectionId === conn.id && isServerAvailable ? (
                        <Badge variant="default" className="mr-2">
                          Connected
                        </Badge>
                      ) : activeConnectionId === conn.id && !isServerAvailable ? (
                        <Badge variant="destructive" className="mr-2">
                          Disconnected
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleConnect(conn)}
                          disabled={connectingId !== null}
                        >
                          {connectingId === conn.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Plug className="h-4 w-4 mr-1" />
                              Connect
                            </>
                          )}
                        </Button>
                      )}

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSetDefault(conn)}
                          >
                            {conn.isDefault ? (
                              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            ) : (
                              <StarOff className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {conn.isDefault ? "Default connection" : "Set as default"}
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingConnection(conn)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingConnection(conn)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Connection Dialog */}
      <Dialog
        open={showAddDialog || editingConnection !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false);
            setEditingConnection(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingConnection ? "Edit Connection" : "Add Connection"}
            </DialogTitle>
            <DialogDescription>
              {editingConnection
                ? "Update your connection settings"
                : "Save a new ClickHouse connection"}
            </DialogDescription>
          </DialogHeader>
          <ConnectionForm
            connection={editingConnection}
            onSuccess={() => {
              setShowAddDialog(false);
              setEditingConnection(null);
            }}
            onCancel={() => {
              setShowAddDialog(false);
              setEditingConnection(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deletingConnection !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingConnection(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingConnection?.name}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Export/Import Dialog */}
      <ExportImportDialog
        open={showExportImport}
        onOpenChange={setShowExportImport}
        connections={connections}
      />
    </TooltipProvider>
  );
}
