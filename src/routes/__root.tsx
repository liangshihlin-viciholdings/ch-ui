import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/common/theme-provider";
import { AppearanceProvider } from "@/contexts/AppearanceContext";
import { AutoRefreshProvider } from "@/features/analytics/contexts/AutoRefreshContext";
import AppInitializer from "@/components/common/AppInit";
import AppSidebar from "@/components/common/AppSidebar";
import { AlertEvaluator } from "@/features/alerts/AlertEvaluator";
import { useVimAppNav } from "@/hooks/useVimAppNav";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  // App-wide vim navigation (Ctrl+hjkl panes, global gt/gT). No-op unless the
  // Vim Mode toggle is on. Lives here so useLocation() (workbench-route check)
  // and the whole pane tree are in scope.
  useVimAppNav();

  return (
    <ThemeProvider defaultTheme="kanso" storageKey="vite-ui-theme">
      <AppearanceProvider>
        <AutoRefreshProvider>
          <AppInitializer>
            <div className="flex h-screen">
              <AppSidebar />
              {/* Single "main" pane for Ctrl+hjkl. On the workbench it wraps the
                  editor/results split (so it's not a leaf and is skipped); on
                  single-pane routes it is the leaf target itself. */}
              <div
                data-vim-pane="main"
                tabIndex={-1}
                className="flex min-w-0 flex-1 outline-none focus:ring-2 focus:ring-inset focus:ring-ring/40"
              >
                <Outlet />
              </div>
            </div>
            <AlertEvaluator />
          </AppInitializer>
        </AutoRefreshProvider>
      </AppearanceProvider>
    </ThemeProvider>
  );
}
