// Electron main process — opens a single BrowserWindow loading the Vite renderer.
import { app, BrowserWindow, shell, ipcMain, dialog } from "electron";
import { join } from "path";
import { readFileSync, writeFileSync } from "node:fs";
import { is } from "@electron-toolkit/utils";
import { registerAdapterIPC } from "./ipc-handlers";
import { registerDbeaverIPC } from "./dbeaver-ipc";
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

// Native open-file dialog for file-engine connections (SQLite/DuckDB).
// Returns the chosen absolute path, or null if cancelled.
function registerDialogIPC(): void {
  ipcMain.handle(
    "dialog:open",
    async (
      _event,
      opts?: { title?: string; filters?: { name: string; extensions: string[] }[] },
    ): Promise<string | null> => {
      const options: Electron.OpenDialogOptions = {
        title: opts?.title ?? "Select database file",
        properties: ["openFile"],
        filters: opts?.filters,
      };
      const win = BrowserWindow.getFocusedWindow();
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      return result.canceled || result.filePaths.length === 0
        ? null
        : result.filePaths[0];
    },
  );
}

// --- Native window preferences (persisted across restarts) ------------------

function windowPrefsPath(): string {
  return join(app.getPath("userData"), "window-prefs.json");
}

function readAutoHideMenuBar(): boolean {
  try {
    const raw = readFileSync(windowPrefsPath(), "utf-8");
    return (JSON.parse(raw) as { autoHideMenuBar?: boolean }).autoHideMenuBar === true;
  } catch {
    return false;
  }
}

function writeAutoHideMenuBar(enabled: boolean): void {
  try {
    writeFileSync(windowPrefsPath(), JSON.stringify({ autoHideMenuBar: enabled }));
  } catch {
    // Best-effort persistence; not fatal if the userData dir is unwritable.
  }
}

function registerWindowIPC(): void {
  ipcMain.handle(
    "window:setAutoHideMenuBar",
    (event, enabled: boolean) => {
      writeAutoHideMenuBar(enabled);
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.setAutoHideMenuBar(enabled);
        win.setMenuBarVisibility(!enabled);
      }
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
    // Apply the persisted preference up-front so the menu bar does not flicker
    // on startup when auto-hide is enabled.
    autoHideMenuBar: readAutoHideMenuBar(),
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
  registerDialogIPC();
  registerAdapterIPC();
  registerDbeaverIPC();
  registerWindowIPC();
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
