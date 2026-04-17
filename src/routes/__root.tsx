import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/common/theme-provider";
import { AppearanceProvider } from "@/contexts/AppearanceContext";
import AppInitializer from "@/components/common/AppInit";
import Sidebar from "@/components/common/Sidebar";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <AppearanceProvider>
        <AppInitializer>
          <div className="flex h-screen">
            <Sidebar />
            <Outlet />
          </div>
        </AppInitializer>
      </AppearanceProvider>
    </ThemeProvider>
  );
}
