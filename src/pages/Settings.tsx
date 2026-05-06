import { Server, Trash2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import useAppStore from "@/stores/workspaceStore";
import { ConnectionManager } from "@/features/connections/components";
import { AppearanceTab } from "@/features/settings/components/AppearanceTab";

export default function SettingsPage() {
  document.title = "CH-UI | Settings";
  const { credential, credentialSource, clearLocalData } = useAppStore();

  const handleClearLocal = () => {
    const confirmed = window.confirm(
      "This will clear tabs saved locally. Credentials are kept. Continue?"
    );
    if (!confirmed) return;
    clearLocalData();
    toast.success("Local data cleared");
  };

  return (
    <div className="max-h-screen w-full overflow-y-auto">
      <div className="max-w-4xl mx-auto py-8 px-4">
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

            {/* Connection Manager - handles add/edit/delete/connect */}
            <ConnectionManager />

            {/* Local data management */}
            <Card className="shadow-lg border-muted">
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <Trash2 className="h-6 w-6 text-primary" />
                  Local Data
                </CardTitle>
                <CardDescription>
                  Clear tabs and dashboard layouts saved in this browser.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  This keeps your saved connections. Use the connection manager
                  above to delete individual connections.
                </p>
              </CardContent>
              <CardFooter className="border-t bg-muted/50 rounded-b-lg pt-4 flex justify-end">
                <Button variant="destructive" onClick={handleClearLocal}>
                  <Trash2 className="mr-2 h-4 w-4" /> Clear Local Data
                </Button>
              </CardFooter>
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
