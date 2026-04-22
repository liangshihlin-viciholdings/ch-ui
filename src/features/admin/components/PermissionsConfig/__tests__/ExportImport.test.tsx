import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { useExportImport } from "../hooks/useExportImport";

// Mock the store
vi.mock("@/stores/workspaceStore", () => ({
  default: vi.fn(() => ({
    clickHouseClient: {
      query: vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          data: [
            { name: "user1", id: "123", auth_type: "plaintext_password" },
            { name: "role1", id: "456" },
          ],
        }),
      }),
    },
    credential: { username: "admin" },
    userPrivileges: { username: "admin" },
  })),
}));

// Mock toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe("Export/Import Functionality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Export Permissions", () => {
    it("should export all permissions to JSON", async () => {
      const TestComponent = () => {
        const { exportPermissions } = useExportImport();
        const [data, setData] = React.useState<any>(null);

        return (
          <div>
            <button
              onClick={async () => {
                const result = await exportPermissions("all");
                setData(result);
              }}
            >
              Export All
            </button>
            {data && <div data-testid="export-data">{JSON.stringify(data)}</div>}
          </div>
        );
      };

      render(<TestComponent />);
      const button = screen.getByText("Export All");
      await userEvent.click(button);

      await waitFor(() => {
        const exportData = screen.getByTestId("export-data");
        expect(exportData).toBeInTheDocument();
        const parsed = JSON.parse(exportData.textContent || "{}");
        expect(parsed).toHaveProperty("version");
        expect(parsed).toHaveProperty("exportedAt");
        expect(parsed).toHaveProperty("users");
        expect(parsed).toHaveProperty("roles");
      });
    });

    it("should export only users when specified", async () => {
      const TestComponent = () => {
        const { exportPermissions } = useExportImport();
        const [data, setData] = React.useState<any>(null);

        return (
          <div>
            <button
              onClick={async () => {
                const result = await exportPermissions("users");
                setData(result);
              }}
            >
              Export Users
            </button>
            {data && <div data-testid="export-data">{JSON.stringify(data)}</div>}
          </div>
        );
      };

      render(<TestComponent />);
      const button = screen.getByText("Export Users");
      await userEvent.click(button);

      await waitFor(() => {
        const exportData = screen.getByTestId("export-data");
        const parsed = JSON.parse(exportData.textContent || "{}");
        expect(parsed).toHaveProperty("users");
        expect(parsed).not.toHaveProperty("roles");
        expect(parsed).not.toHaveProperty("quotas");
      });
    });

    it("should include metadata in export", async () => {
      const TestComponent = () => {
        const { exportPermissions } = useExportImport();
        const [data, setData] = React.useState<any>(null);

        return (
          <div>
            <button
              onClick={async () => {
                const result = await exportPermissions("all");
                setData(result);
              }}
            >
              Export
            </button>
            {data && <div data-testid="export-data">{JSON.stringify(data)}</div>}
          </div>
        );
      };

      render(<TestComponent />);
      await userEvent.click(screen.getByText("Export"));

      await waitFor(() => {
        const exportData = screen.getByTestId("export-data");
        const parsed = JSON.parse(exportData.textContent || "{}");
        expect(parsed.version).toBe("1.0");
        expect(parsed.exportedAt).toBeDefined();
        expect(parsed.exportedBy).toBe("admin");
      });
    });
  });

  describe("Import Permissions", () => {
    it("should validate import data structure", async () => {
      const TestComponent = () => {
        const { validateImport } = useExportImport();
        const [isValid, setIsValid] = React.useState<boolean | null>(null);

        return (
          <div>
            <button
              onClick={() => {
                const valid = validateImport({
                  version: "1.0",
                  exportedAt: new Date().toISOString(),
                  exportedBy: "admin",
                  users: [],
                  roles: [],
                });
                setIsValid(valid);
              }}
            >
              Validate Valid
            </button>
            <button
              onClick={() => {
                const valid = validateImport({ invalid: "data" });
                setIsValid(valid);
              }}
            >
              Validate Invalid
            </button>
            {isValid !== null && (
              <div data-testid="validation-result">{isValid ? "valid" : "invalid"}</div>
            )}
          </div>
        );
      };

      render(<TestComponent />);

      await userEvent.click(screen.getByText("Validate Valid"));
      await waitFor(() => {
        expect(screen.getByTestId("validation-result")).toHaveTextContent("valid");
      });

      await userEvent.click(screen.getByText("Validate Invalid"));
      await waitFor(() => {
        expect(screen.getByTestId("validation-result")).toHaveTextContent("invalid");
      });
    });

    it("should reject incompatible versions", async () => {
      const TestComponent = () => {
        const { validateImport } = useExportImport();
        const [isValid, setIsValid] = React.useState<boolean | null>(null);

        return (
          <div>
            <button
              onClick={() => {
                const valid = validateImport({
                  version: "2.0", // Future version
                  exportedAt: new Date().toISOString(),
                  exportedBy: "admin",
                  users: [],
                });
                setIsValid(valid);
              }}
            >
              Validate
            </button>
            {isValid !== null && (
              <div data-testid="validation-result">{isValid ? "valid" : "invalid"}</div>
            )}
          </div>
        );
      };

      render(<TestComponent />);
      await userEvent.click(screen.getByText("Validate"));

      await waitFor(() => {
        expect(screen.getByTestId("validation-result")).toHaveTextContent("invalid");
      });
    });

    it("should calculate diff between current and import", async () => {
      const TestComponent = () => {
        const { calculateDiff } = useExportImport();
        const [diff, setDiff] = React.useState<any>(null);

        return (
          <div>
            <button
              onClick={() => {
                const result = calculateDiff(
                  {
                    users: [{ name: "user1", id: "1" }],
                    roles: [{ name: "role1", id: "2" }],
                  },
                  {
                    users: [
                      { name: "user1", id: "1" },
                      { name: "user2", id: "3" },
                    ],
                    roles: [],
                  }
                );
                setDiff(result);
              }}
            >
              Calculate Diff
            </button>
            {diff && <div data-testid="diff-result">{JSON.stringify(diff)}</div>}
          </div>
        );
      };

      render(<TestComponent />);
      await userEvent.click(screen.getByText("Calculate Diff"));

      await waitFor(() => {
        const diffResult = screen.getByTestId("diff-result");
        const parsed = JSON.parse(diffResult.textContent || "{}");
        expect(parsed.usersToAdd).toHaveLength(1);
        expect(parsed.usersToAdd[0].name).toBe("user2");
        expect(parsed.rolesToRemove).toHaveLength(1);
      });
    });
  });

  describe("File Operations", () => {
    it("should download export as JSON file", async () => {
      // Mock URL.createObjectURL and download
      const mockCreateObjectURL = vi.fn(() => "blob:mock-url");
      const mockRevokeObjectURL = vi.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      const TestComponent = () => {
        const { downloadExport } = useExportImport();

        return (
          <button
            onClick={() => {
              downloadExport(
                {
                  version: "1.0",
                  exportedAt: new Date().toISOString(),
                  exportedBy: "admin",
                  users: [],
                  roles: [],
                },
                "permissions-backup.json"
              );
            }}
          >
            Download
          </button>
        );
      };

      render(<TestComponent />);
      await userEvent.click(screen.getByText("Download"));

      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it("should read import file", async () => {
      const TestComponent = () => {
        const { readImportFile } = useExportImport();
        const [content, setContent] = React.useState<any>(null);

        return (
          <div>
            <input
              type="file"
              data-testid="file-input"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const data = await readImportFile(file);
                  setContent(data);
                }
              }}
            />
            {content && <div data-testid="file-content">{JSON.stringify(content)}</div>}
          </div>
        );
      };

      render(<TestComponent />);

      const fileInput = screen.getByTestId("file-input");
      const file = new File(
        [JSON.stringify({ version: "1.0", users: [] })],
        "test.json",
        { type: "application/json" }
      );

      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        const content = screen.getByTestId("file-content");
        const parsed = JSON.parse(content.textContent || "{}");
        expect(parsed.version).toBe("1.0");
      });
    });
  });

  describe("Partial Import", () => {
    it("should import only selected entity types", async () => {
      const TestComponent = () => {
        const { importPermissions } = useExportImport();
        const [result, setResult] = React.useState<string | null>(null);

        return (
          <div>
            <button
              onClick={async () => {
                const importData = {
                  version: "1.0",
                  exportedAt: new Date().toISOString(),
                  exportedBy: "admin",
                  users: [{ name: "user1" }],
                  roles: [{ name: "role1" }],
                  quotas: [{ name: "quota1" }],
                };
                const res = await importPermissions(importData, ["users", "roles"]);
                setResult(res.success ? "success" : "failed");
              }}
            >
              Import
            </button>
            {result && <div data-testid="import-result">{result}</div>}
          </div>
        );
      };

      render(<TestComponent />);
      await userEvent.click(screen.getByText("Import"));

      await waitFor(() => {
        expect(screen.getByTestId("import-result")).toHaveTextContent("success");
      });
    });
  });
});
