import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/common/theme-provider";
import { AppearanceProvider } from "@/contexts/AppearanceContext";
import { AutoRefreshProvider } from "@/features/analytics/contexts/AutoRefreshContext";
import AppInitializer from "@/components/common/AppInit";
import AppSidebar from "@/components/common/AppSidebar";
import { AlertEvaluator } from "@/features/alerts/AlertEvaluator";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ThemeProvider defaultTheme="kanso" storageKey="vite-ui-theme">
      <AppearanceProvider>
        <AutoRefreshProvider>
          <AppInitializer>
            <div className="flex h-screen">
              <AppSidebar />
              <Outlet />
            </div>
            <AlertEvaluator />
          </AppInitializer>
        </AutoRefreshProvider>
      </AppearanceProvider>
    </ThemeProvider>
  );
}
