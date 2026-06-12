// Electron main process — opens a single BrowserWindow loading the Vite renderer.
import { app, BrowserWindow, shell, ipcMain } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { registerAdapterIPC } from "./ipc-handlers";
import {
  initSecrets,
  storePassword,
  retrievePassword,
  deletePassword,
} from "./secrets";

app.commandLine.appendSwitch("no-sandbox");

function registerSecretsIPC(): void {
  ipcMain.handle(
    "secrets:store",
    (_event, connectionId: string, password: string) => {
      storePassword(connectionId, password);
    },
  );
  ipcMain.handle(
    "secrets:retrieve",
    (_event, connectionId: string) => {
      return retrievePassword(connectionId);
    },
  );
  ipcMain.handle(
    "secrets:delete",
    (_event, connectionId: string) => {
      deletePassword(connectionId);
    },
  );
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: "ch-ui",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.mjs"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../../dist/index.html"));
  }

  return mainWindow;
}

app.whenReady().then(() => {
  initSecrets();
  registerSecretsIPC();
  registerAdapterIPC();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
