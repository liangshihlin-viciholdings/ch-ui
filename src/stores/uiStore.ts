// src/stores/uiStore.ts
// Global UI state (sidebar, command palette). Not yet wired to existing
// consumers — new code introduced during later refactor phases will read
// from this store.

import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";

export interface UIState {
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
}

export const uiStore = new Store<UIState>({
  sidebarOpen: true,
  commandPaletteOpen: false,
});

export function toggleSidebar() {
  uiStore.setState((prev) => ({
    ...prev,
    sidebarOpen: !prev.sidebarOpen,
  }));
}

export function setSidebarOpen(open: boolean) {
  uiStore.setState((prev) => ({ ...prev, sidebarOpen: open }));
}

export function setCommandPaletteOpen(open: boolean) {
  uiStore.setState((prev) => ({ ...prev, commandPaletteOpen: open }));
}

export function useSidebarOpen(): boolean {
  return useStore(uiStore, (s) => s.sidebarOpen);
}

export function useCommandPaletteOpen(): boolean {
  return useStore(uiStore, (s) => s.commandPaletteOpen);
}
