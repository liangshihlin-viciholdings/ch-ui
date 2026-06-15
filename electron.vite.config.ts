// electron.vite.config.ts — Desktop build config.
// Reuses src/ as the renderer. The web vite.config.ts stays untouched.
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import pkg from "./package.json";

const srcAlias = { "@": resolve(__dirname, "./src") };
const defines = { __CH_UI_VERSION__: JSON.stringify(pkg.version) };

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: srcAlias,
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, "electron/main.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: srcAlias,
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, "electron/preload.ts"),
      },
    },
  },
  renderer: {
    root: ".",
    define: defines,
    plugins: [
      TanStackRouterVite({
        routesDirectory: "./src/routes",
        generatedRouteTree: "./src/routeTree.gen.ts",
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: srcAlias,
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      rollupOptions: {
        input: resolve(__dirname, "index.html"),
      },
    },
  },
});
