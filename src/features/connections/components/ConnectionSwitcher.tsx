// src/features/connections/components/ConnectionSwitcher.tsx
// Quick connection switcher component for sidebar/header

import { useState, useEffect } from "react";
import {
  Database,
  ChevronDown,
  Loader2,
  PlugZap,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useConnectionStore } from "@/stores/connectionStore";
import useAppStore from "@/stores/workspaceStore";
import { ConnectionDisplay } from "@/lib/db";

export default function ConnectionSwitcher() {
  const navigate = useNavigate();

  const {
    connections,
    activeConnectionId,
    isLoading,
    loadConnections,
    setActiveConnection,
  } = useConnectionStore();

  const { setCredential, checkServerStatus, isServerAvailable, credential } =
    useAppStore();

  const [connectingId, setConnectingId] = useState<string | null>(null);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const activeConnection = connections.find((c) => c.id === activeConnectionId);

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
      toast.error(
        "Failed to connect: " +
          (err instanceof Error ? err.message : "Unknown error"),
      );
    } finally {
      setConnectingId(null);
    }
  };

  // If no connections saved yet
  if (connections.length === 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-muted-foreground"
        onClick={() => navigate({ to: "/settings" })}
      >
        <Database className="h-4 w-4" />
        No saved connections
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between gap-2"
        >
          <div className="flex items-center gap-2 truncate">
            {isServerAvailable ? (
              <PlugZap className="h-4 w-4 text-green-500 shrink-0" />
            ) : (
              <Database className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">
              {activeConnection?.name ||
                (isServerAvailable
                  ? `${credential?.username}@${
                      credential?.url ? new URL(credential.url).host : ""
                    }`
                  : "Select connection")}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          Connections
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          connections.map((conn) => (
            <DropdownMenuItem
              key={conn.id}
              className="flex items-center justify-between cursor-pointer"
              onClick={() => handleConnect(conn)}
              disabled={connectingId !== null}
            >
              <div className="flex items-center gap-2 truncate">
                {connectingId === conn.id ? (
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                ) : activeConnectionId === conn.id ? (
                  <PlugZap className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <Database className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">{conn.name}</span>
              </div>
              {conn.isDefault && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  Default
                </Badge>
              )}
            </DropdownMenuItem>
          ))
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => navigate({ to: "/settings" })}
        >
          <Settings className="h-4 w-4 mr-2" />
          Manage Connections
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
