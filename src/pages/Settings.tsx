import { Server, Palette, Database, Clock, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import useAppStore from "@/stores/workspaceStore";
import { useWorkbenchStore } from "@/stores/workbenchStore";
import { AppearanceTab } from "@/features/settings/components/AppearanceTab";

const TIMEOUT_PRESETS = [
  { value: "10000", label: "10 seconds" },
  { value: "30000", label: "30 seconds" },
  { value: "60000", label: "1 minute" },
  { value: "120000", label: "2 minutes" },
  { value: "300000", label: "5 minutes" },
  { value: "0", label: "No timeout" },
] as const;

export default function SettingsPage() {
  document.title = "deebee | Settings";
  const {
    credential,
    credentialSource,
    clickhouseSettings,
    updateConfiguration,
    setCredential,
  } = useAppStore();

  const connections = useWorkbenchStore((s) => s.connections);
  const activeConnectionId = useWorkbenchStore((s) => s.activeConnectionId);
  const activeConnection = connections.find(
    (c) => c.id === activeConnectionId,
  );

  const handleMaxRowsChange = (value: string) => {
    const num = value.replace(/[^0-9]/g, "");
    updateConfiguration({
      ...clickhouseSettings,
      max_result_rows: num || "0",
    }).then(() => toast.success("Query defaults updated"));
  };

  const handleMaxBytesChange = (value: string) => {
    const num = value.replace(/[^0-9]/g, "");
    updateConfiguration({
      ...clickhouseSettings,
      max_result_bytes: num || "0",
    }).then(() => toast.success("Query defaults updated"));
  };

  const handleOverflowModeChange = (mode: "break" | "throw") => {
    updateConfiguration({
      ...clickhouseSettings,
      result_overflow_mode: mode,
    }).then(() => toast.success("Query defaults updated"));
  };

  const handleTimeoutChange = (ms: string) => {
    setCredential({
      ...credential,
      requestTimeout: Number(ms),
    })
      .then(() => toast.success("Request timeout updated"))
      .catch(() => toast.error("Failed to update timeout"));
  };

  return (
    <div className="flex-1 w-full overflow-y-auto">
      <div className="container mx-auto max-w-4xl px-4 py-4">
        <h1 className="text-3xl font-bold mb-6">Settings</h1>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="general">
              <Server className="mr-2 h-4 w-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="appearance">
              <Palette className="mr-2 h-4 w-4" />
              Appearance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-8">
            {credentialSource === "env" && (
              <Alert variant="info">
                <AlertTitle className="flex items-center font-semibold">
                  <Server className="mr-2 h-4 w-4" />
                  Using Environment Variables
                </AlertTitle>
                <AlertDescription>
                  Your ClickHouse credentials are set using environment variables.
                  Please update your environment variables to change the
                  connection settings.
                  <hr className="my-4" />
                  <p className="text-sm">
                    You are connected to: {credential?.url}
                    <br />
                    User: {credential?.username}
                    <br />
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {/* Query Defaults */}
            <Card className="shadow-lg border-muted">
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <Database className="h-6 w-6 text-primary" />
                  Query Defaults
                </CardTitle>
                <CardDescription>
                  Default limits applied to all queries. These prevent
                  accidentally pulling massive result sets into the browser.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="max-result-rows">Max Result Rows</Label>
                  <Input
                    id="max-result-rows"
                    type="text"
                    inputMode="numeric"
                    value={clickhouseSettings.max_result_rows ?? "0"}
                    onChange={(e) => handleMaxRowsChange(e.target.value)}
                    className="w-40"
                  />
                  <p className="text-xs text-muted-foreground">
                    Queries stop processing after this many rows. Set to 0 for
                    no limit. Default is 200.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-result-bytes">Max Result Bytes</Label>
                  <Input
                    id="max-result-bytes"
                    type="text"
                    inputMode="numeric"
                    value={clickhouseSettings.max_result_bytes ?? "0"}
                    onChange={(e) => handleMaxBytesChange(e.target.value)}
                    className="w-40"
                  />
                  <p className="text-xs text-muted-foreground">
                    Queries stop processing after this many bytes of output. Set
                    to 0 for no limit.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="overflow-mode">Overflow Mode</Label>
                  <Select
                    value={clickhouseSettings.result_overflow_mode ?? "break"}
                    onValueChange={(v) =>
                      handleOverflowModeChange(v as "break" | "throw")
                    }
                  >
                    <SelectTrigger id="overflow-mode" className="w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="break">
                        Break — stop and return partial results
                      </SelectItem>
                      <SelectItem value="throw">
                        Throw — error when limit is exceeded
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    What happens when the row limit is reached.{" "}
                    <span className="font-medium">Break</span> silently truncates
                    results; <span className="font-medium">Throw</span> raises an
                    error.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Request Timeout */}
            <Card className="shadow-lg border-muted">
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <Clock className="h-6 w-6 text-primary" />
                  Request Timeout
                </CardTitle>
                <CardDescription>
                  How long queries are allowed to run before being aborted.
                  Changing this will reconnect to the server.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="request-timeout">Timeout Duration</Label>
                  <Select
                    value={String(credential.requestTimeout ?? 30000)}
                    onValueChange={handleTimeoutChange}
                  >
                    <SelectTrigger id="request-timeout" className="w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEOUT_PRESETS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Current: {(credential.requestTimeout ?? 30000) / 1000}s.
                    Increase this if you run long analytical queries that get
                    cut off.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* About */}
            <Card className="shadow-lg border-muted">
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <Info className="h-6 w-6 text-primary" />
                  About
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                  <span className="text-muted-foreground">Application</span>
                  <span className="font-medium">
                    deebee v{__CH_UI_VERSION__}
                  </span>

                  <span className="text-muted-foreground">
                    Saved connections
                  </span>
                  <span>{connections.length}</span>

                  {activeConnection && (
                    <>
                      <span className="text-muted-foreground">
                        Active connection
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block size-2 rounded-full bg-green-500" />
                        <span className="font-medium">
                          {activeConnection.name}
                        </span>
                        <span className="text-muted-foreground">
                          ({activeConnection.engine})
                        </span>
                      </span>

                      <span className="text-muted-foreground">Endpoint</span>
                      <span className="font-mono text-xs truncate">
                        {activeConnection.filePath ||
                          activeConnection.url ||
                          "—"}
                      </span>

                      {activeConnection.username && (
                        <>
                          <span className="text-muted-foreground">User</span>
                          <span className="font-mono text-xs">
                            {activeConnection.username}
                          </span>
                        </>
                      )}
                    </>
                  )}

                  <span className="text-muted-foreground">Engines</span>
                  <span className="text-xs">
                    ClickHouse, PostgreSQL, MySQL, SQLite, DuckDB
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance">
            <AppearanceTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
