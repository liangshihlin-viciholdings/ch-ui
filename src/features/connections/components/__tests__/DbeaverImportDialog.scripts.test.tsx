// Desktop flow: auto-detected workspace with SQL scripts → import wires scripts
// through to importFromDbeaver. Mocks the access layer (Electron IPC) + store.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DbeaverImportDialog from "../DbeaverImportDialog";
import { importFromDbeaver } from "@/stores/connectionStore";

const RESULT = {
  connections: [
    {
      sourceId: "pg1",
      name: "Main",
      engine: "postgres" as const,
      url: "h:5432",
      database: "app",
      username: "admin",
      password: "x",
      hasPassword: true,
    },
  ],
  skipped: [],
  scripts: [
    { name: "Q1", query: "select 1", sourceConnectionId: "pg1", databaseName: "app" },
    { name: "Q2", query: "select 2", sourceConnectionId: "pg1" },
  ],
};

vi.mock("@/lib/dbeaver/access", () => ({
  isDesktop: () => true,
  detectDbeaverWorkspaces: vi.fn(async () => [
    {
      dataSourcesPath: "/ws/VICI/.dbeaver/data-sources.json",
      hasCredentials: true,
      label: "VICI",
    },
  ]),
  readDbeaverWorkspace: vi.fn(async () => RESULT),
  pickDbeaverFile: vi.fn(),
  parseUploadedDbeaver: vi.fn(),
}));

vi.mock("@/stores/connectionStore", () => ({
  importFromDbeaver: vi.fn(async () => ({
    success: 1,
    failed: 0,
    skipped: 0,
    scriptsImported: 2,
    scriptsSkipped: 0,
  })),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

describe("DbeaverImportDialog (desktop scripts flow)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("imports detected connections and links SQL scripts", async () => {
    const user = userEvent.setup();
    render(
      <DbeaverImportDialog open onOpenChange={() => {}} existingNames={new Set()} />,
    );

    // Auto-detected workspace appears; select it.
    await user.click(await screen.findByText("VICI"));

    // Preview shows the connection and the scripts toggle.
    expect(await screen.findByText("Main")).toBeInTheDocument();
    expect(
      screen.getByText(/Also import 2 SQL script/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /import 1 connection/i }));

    await waitFor(() => expect(importFromDbeaver).toHaveBeenCalledTimes(1));
    expect(importFromDbeaver).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "Main" })]),
      expect.objectContaining({
        skipExisting: true,
        scripts: expect.arrayContaining([
          expect.objectContaining({ name: "Q1", sourceConnectionId: "pg1" }),
          expect.objectContaining({ name: "Q2" }),
        ]),
      }),
    );
  });
});
