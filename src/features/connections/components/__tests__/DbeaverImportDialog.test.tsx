// src/features/connections/components/__tests__/DbeaverImportDialog.test.tsx
// DOM render test for the DBeaver migration wizard (web upload path).
// Exercises the real parser; mocks the DB-writing store action so the test
// does not need IndexedDB.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DbeaverImportDialog from "../DbeaverImportDialog";
import { importFromDbeaver } from "@/stores/connectionStore";

vi.mock("@/stores/connectionStore", () => ({
  importFromDbeaver: vi.fn(async () => ({ success: 1, failed: 0, skipped: 0 })),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

const DATA_SOURCES = JSON.stringify({
  connections: {
    pg1: {
      provider: "postgresql",
      driver: "postgres-jdbc",
      name: "My PG",
      configuration: { host: "h", port: "5432", database: "app", user: "admin" },
    },
    ora: { provider: "oracle", driver: "oracle_thin", name: "Legacy Oracle" },
  },
});

function dataSourcesFile(): File {
  return new File([DATA_SOURCES], "data-sources.json", {
    type: "application/json",
  });
}

describe("DbeaverImportDialog (web upload flow)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses an uploaded data-sources.json and imports the selection", async () => {
    const user = userEvent.setup();
    render(
      <DbeaverImportDialog
        open
        onOpenChange={() => {}}
        existingNames={new Set()}
      />,
    );

    // Source step: upload the data-sources.json file.
    const input = screen.getByLabelText(/data-sources\.json/i);
    await user.upload(input, dataSourcesFile());

    await user.click(screen.getByRole("button", { name: /continue/i }));

    // Preview step: the supported connection is listed; the Oracle one is skipped.
    expect(await screen.findByText("My PG")).toBeInTheDocument();
    expect(screen.getByText("postgres")).toBeInTheDocument();
    expect(screen.getByText(/no password/i)).toBeInTheDocument();
    expect(screen.getByText(/connection\(s\) skipped/i)).toBeInTheDocument();

    // Import the selection.
    await user.click(
      screen.getByRole("button", { name: /import 1 connection/i }),
    );

    await waitFor(() => expect(importFromDbeaver).toHaveBeenCalledTimes(1));
    expect(importFromDbeaver).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "My PG",
          engine: "postgres",
          url: "h:5432",
          database: "app",
          username: "admin",
        }),
      ]),
      { skipExisting: true },
    );
  });
});
