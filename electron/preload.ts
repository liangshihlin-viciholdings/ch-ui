// Preload script — exposes safe APIs to the renderer via contextBridge.
import { contextBridge, ipcRenderer } from "electron";

const api = {
  /** Check if running inside Electron */
  isDesktop: true,

  /** Invoke an IPC channel and await the result */
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),

  /** Listen for a one-way message from main */
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
};

export type ElectronAPI = typeof api;

contextBridge.exposeInMainWorld("electronAPI", api);
