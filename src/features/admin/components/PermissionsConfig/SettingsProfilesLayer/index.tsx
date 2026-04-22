import { useState, useEffect } from "react";
import type { ResponseJSON } from "@clickhouse/client-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Plus, Edit, Trash2 } from "lucide-react";
import useAppStore from "@/stores/workspaceStore";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import SettingsProfileEditor from "./SettingsProfileEditor";

interface SettingsProfileData {
  name: string;
  id: string;
  settings: Array<{ name: string; value: string }>;
}

interface SettingsProfilesLayerProps {
  onAddChange: (change: any) => void;
}

export default function SettingsProfilesLayer({
  onAddChange,
}: SettingsProfilesLayerProps) {
  const { clickHouseClient, userPrivileges } = useAppStore();
  const [profiles, setProfiles] = useState<SettingsProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<SettingsProfileData | null>(
    null
  );
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const canEdit = userPrivileges?.canAlterSettingsProfile;
  const canCreate = userPrivileges?.canCreateSettingsProfile;
  const canDelete = userPrivileges?.canDropSettingsProfile;

  // Fetch settings profiles from ClickHouse
  useEffect(() => {
    async function fetchProfiles() {
      if (!clickHouseClient) return;

      setLoading(true);
      try {
        const query = `
          SELECT
            name,
            id
          FROM system.settings_profiles
          ORDER BY name
        `;

        const result = await clickHouseClient.query({ query });
        const response = (await result.json()) as ResponseJSON<{ name: string; id: string }>;

        // For each profile, fetch its settings
        const profilesWithSettings: SettingsProfileData[] = [];
        for (const profile of response.data) {
          const settingsQuery = `
            SELECT setting_name as name, value
            FROM system.settings_profile_elements
            WHERE profile_name = '${profile.name}'
          `;
          const settingsResult = await clickHouseClient.query({
            query: settingsQuery,
          });
          const settingsResponse = (await settingsResult.json()) as ResponseJSON<{
            name: string;
            value: string;
          }>;

          profilesWithSettings.push({
            ...profile,
            settings: settingsResponse.data,
          });
        }

        setProfiles(profilesWithSettings);
      } catch (error) {
        console.error("Failed to fetch settings profiles:", error);
        toast.error("Failed to fetch settings profiles");
      } finally {
        setLoading(false);
      }
    }

    fetchProfiles();
  }, [clickHouseClient]);

  // Filter profiles based on search term
  const filteredProfiles = profiles.filter((profile) =>
    profile.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEditProfile = (profile: SettingsProfileData) => {
    setSelectedProfile(profile);
    setIsEditorOpen(true);
  };

  const handleCreateProfile = () => {
    setSelectedProfile(null);
    setIsEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setSelectedProfile(null);
  };

  const handleDeleteProfile = (profile: SettingsProfileData) => {
    // Stage deletion change
    onAddChange({
      type: "DROP",
      entityType: "SETTINGS_PROFILE",
      entityName: profile.name,
      description: `Delete settings profile ${profile.name}`,
      sqlStatements: [`DROP SETTINGS PROFILE ${profile.name}`],
      originalState: { profile },
      newState: null,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Settings Profiles Management</h3>
          <p className="text-sm text-muted-foreground">
            Define default settings for users and roles
          </p>
        </div>
        {canCreate && (
          <Button onClick={handleCreateProfile} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Profile
          </Button>
        )}
      </div>

      {/* Info banner */}
      <div className="border-l-4 border-blue-500 bg-blue-500/10 p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Settings Profiles</strong> allow you to define default ClickHouse
          settings (max_memory_usage, max_threads, etc.) that apply to users or roles.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search profiles..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Profiles table */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading settings profiles...
        </div>
      ) : filteredProfiles.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchTerm ? "No profiles found" : "No settings profiles configured"}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Profile Name</TableHead>
                <TableHead>Settings Count</TableHead>
                <TableHead>Key Settings</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProfiles.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium">{profile.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{profile.settings.length} settings</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs space-y-1 max-w-md">
                      {profile.settings.slice(0, 3).map((setting, idx) => (
                        <div key={idx} className="text-muted-foreground">
                          <code>
                            {setting.name} = {setting.value}
                          </code>
                        </div>
                      ))}
                      {profile.settings.length > 3 && (
                        <div className="text-muted-foreground">
                          ... and {profile.settings.length - 3} more
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditProfile(profile)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteProfile(profile)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Profile editor dialog */}
      {isEditorOpen && (
        <SettingsProfileEditor
          profile={selectedProfile}
          onClose={handleCloseEditor}
          onAddChange={onAddChange}
        />
      )}
    </div>
  );
}
