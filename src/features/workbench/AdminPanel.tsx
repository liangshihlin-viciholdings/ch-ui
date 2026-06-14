import { useEffect, useState } from "react";
import { Users, Shield, KeyRound, Lock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useWorkbenchStore,
  loadAdmin,
  setAdminView,
} from "@/stores/workbenchStore";
import type { AdminCapabilities } from "@/lib/db-adapter/types";

function UsersTab() {
  const activeId = useWorkbenchStore((s) => s.activeConnectionId);
  const admin = useWorkbenchStore((s) =>
    activeId ? s.admin[activeId] : null,
  );

  if (!admin) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Users ({admin.users.length})
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50">
            <tr>
              <th className="border-b border-border px-3 py-1.5 text-left">Name</th>
              <th className="border-b border-border px-3 py-1.5 text-left">Login</th>
              <th className="border-b border-border px-3 py-1.5 text-left">Superuser</th>
              <th className="border-b border-border px-3 py-1.5 text-left">Host</th>
            </tr>
          </thead>
          <tbody>
            {admin.users.map((u) => (
              <tr key={`${u.name}-${u.host ?? ""}`} className="hover:bg-accent/30">
                <td className="border-b border-border/50 px-3 py-1 font-mono text-xs">{u.name}</td>
                <td className="border-b border-border/50 px-3 py-1 text-xs">
                  {u.login ? "✓" : ""}
                </td>
                <td className="border-b border-border/50 px-3 py-1 text-xs">
                  {u.superuser ? "✓" : ""}
                </td>
                <td className="border-b border-border/50 px-3 py-1 font-mono text-xs">
                  {u.host ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RolesTab() {
  const activeId = useWorkbenchStore((s) => s.activeConnectionId);
  const admin = useWorkbenchStore((s) =>
    activeId ? s.admin[activeId] : null,
  );

  if (!admin) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Roles ({admin.roles.length})
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50">
            <tr>
              <th className="border-b border-border px-3 py-1.5 text-left">Name</th>
              <th className="border-b border-border px-3 py-1.5 text-left">Members</th>
            </tr>
          </thead>
          <tbody>
            {admin.roles.map((r) => (
              <tr key={r.name} className="hover:bg-accent/30">
                <td className="border-b border-border/50 px-3 py-1 font-mono text-xs">{r.name}</td>
                <td className="border-b border-border/50 px-3 py-1 text-xs">
                  {r.members?.join(", ") ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GrantsTab() {
  const activeId = useWorkbenchStore((s) => s.activeConnectionId);
  const admin = useWorkbenchStore((s) =>
    activeId ? s.admin[activeId] : null,
  );

  if (!admin) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Grants ({admin.grants.length})
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50">
            <tr>
              <th className="border-b border-border px-3 py-1.5 text-left">Grantee</th>
              <th className="border-b border-border px-3 py-1.5 text-left">Privilege</th>
              <th className="border-b border-border px-3 py-1.5 text-left">Object</th>
              <th className="border-b border-border px-3 py-1.5 text-left">Grant Option</th>
            </tr>
          </thead>
          <tbody>
            {admin.grants.map((g, i) => (
              <tr key={i} className="hover:bg-accent/30">
                <td className="border-b border-border/50 px-3 py-1 font-mono text-xs">{g.grantee}</td>
                <td className="border-b border-border/50 px-3 py-1 font-mono text-xs">{g.privilege}</td>
                <td className="border-b border-border/50 px-3 py-1 font-mono text-xs">{g.object ?? "—"}</td>
                <td className="border-b border-border/50 px-3 py-1 text-xs">
                  {g.grantOption ? "✓" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowPoliciesTab() {
  const activeId = useWorkbenchStore((s) => s.activeConnectionId);
  const admin = useWorkbenchStore((s) =>
    activeId ? s.admin[activeId] : null,
  );

  if (!admin) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Row Policies ({admin.rowPolicies.length})
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50">
            <tr>
              <th className="border-b border-border px-3 py-1.5 text-left">Name</th>
              <th className="border-b border-border px-3 py-1.5 text-left">Table</th>
              <th className="border-b border-border px-3 py-1.5 text-left">Filter</th>
            </tr>
          </thead>
          <tbody>
            {admin.rowPolicies.map((p) => (
              <tr key={`${p.name}-${p.table}`} className="hover:bg-accent/30">
                <td className="border-b border-border/50 px-3 py-1 font-mono text-xs">{p.name}</td>
                <td className="border-b border-border/50 px-3 py-1 font-mono text-xs">{p.table}</td>
                <td className="border-b border-border/50 px-3 py-1 font-mono text-xs">{p.filter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TABS: { key: keyof AdminCapabilities; label: string; icon: typeof Users }[] = [
  { key: "users", label: "Users", icon: Users },
  { key: "roles", label: "Roles", icon: Shield },
  { key: "grants", label: "Grants", icon: KeyRound },
  { key: "rowPolicies", label: "Row Policies", icon: Lock },
];

export default function AdminPanel() {
  const activeId = useWorkbenchStore((s) => s.activeConnectionId);
  const caps = useWorkbenchStore((s) =>
    activeId ? s.capabilities[activeId]?.admin : null,
  );
  const [tab, setTab] = useState<keyof AdminCapabilities>("users");

  useEffect(() => {
    if (activeId) {
      void loadAdmin(activeId);
    }
  }, [activeId]);

  if (!caps) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button size="sm" variant="ghost" onClick={() => setAdminView(false)}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Admin features not available for this engine.
        </div>
      </div>
    );
  }

  const availableTabs = TABS.filter((t) => caps[t.key]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button size="sm" variant="ghost" onClick={() => setAdminView(false)}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <span className="text-sm font-medium">Admin</span>
      </div>
      <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2">
        {availableTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
                tab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === "users" && caps.users && <UsersTab />}
        {tab === "roles" && caps.roles && <RolesTab />}
        {tab === "grants" && caps.grants && <GrantsTab />}
        {tab === "rowPolicies" && caps.rowPolicies && <RowPoliciesTab />}
      </div>
    </div>
  );
}
