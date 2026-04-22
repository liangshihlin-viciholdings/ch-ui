import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import ConnectionForm from "./ConnectionForm";
import { toast } from "sonner";
import * as clickhouseClient from "@clickhouse/client-web";
import { ClickHouseError } from "@/lib/clickhouseError";

// Mock dependencies
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@clickhouse/client-web", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/stores/connectionStore", () => ({
  useConnectionStore: () => ({
    saveConnection: vi.fn().mockResolvedValue(true),
    updateConnectionById: vi.fn().mockResolvedValue(true),
  }),
}));

describe("ConnectionForm - Connection Test Button", () => {
  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();
  const mockCreateClient = vi.spyOn(clickhouseClient, "createClient");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Button State Management", () => {
    it("should render test connection button", () => {
      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      expect(testButton).toBeInTheDocument();
    });

    it("should disable test button when form is invalid", async () => {
      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      expect(testButton).toBeDisabled();
    });

    it("should enable test button when form is valid", async () => {
      const user = userEvent.setup();

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test Connection");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      expect(testButton).not.toBeDisabled();
    });

    it("should disable test button during loading state", async () => {
      const user = userEvent.setup();
      const mockPing = vi.fn().mockImplementation(() => {
        return new Promise(() => {}); // Never resolves to keep loading state
      });
      const mockClient = { ping: mockPing };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      // Fill form
      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test Connection");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });

      // Click test button
      await user.click(testButton);

      // Button should show loading state and be disabled
      await waitFor(() => {
        expect(screen.getByText("Testing...")).toBeInTheDocument();
      });

      const loadingButton = screen.getByRole("button", { name: /Testing/i });
      expect(loadingButton).toBeDisabled();
    });

    it("should show loading spinner during test", async () => {
      const user = userEvent.setup();
      const mockPing = vi.fn().mockImplementation(() => {
        return new Promise(() => {}); // Never resolves
      });
      const mockClient = { ping: mockPing };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      // Fill form with valid values
      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(screen.getByText("Testing...")).toBeInTheDocument();
      });
    });
  });

  describe("Successful Connection Test", () => {
    it("should display success message on successful connection", async () => {
      const user = userEvent.setup();
      const mockVersionResult = {
        json: vi.fn().mockResolvedValue({
          data: [{ "version()": "23.8.1.1" }],
        }),
      };
      const mockPing = vi.fn().mockResolvedValue(undefined);
      const mockQuery = vi.fn().mockResolvedValue(mockVersionResult);
      const mockClient = {
        ping: mockPing,
        query: mockQuery,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      // Fill form
      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test Connection");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      // Wait for success message
      await waitFor(() => {
        expect(screen.getByText(/Connected successfully! Server version: 23.8.1.1/)).toBeInTheDocument();
      });

      // Verify success styling by finding the container with success styling
      const allDivs = document.querySelectorAll("div");
      const successContainer = Array.from(allDivs).find(
        (el) => el.className && el.className.includes("bg-green-50")
      );
      expect(successContainer).toBeDefined();
    });

    it("should show version in success message", async () => {
      const user = userEvent.setup();
      const mockVersionResult = {
        json: vi.fn().mockResolvedValue({
          data: [{ "version()": "24.1.2.5" }],
        }),
      };
      const mockPing = vi.fn().mockResolvedValue(undefined);
      const mockQuery = vi.fn().mockResolvedValue(mockVersionResult);
      const mockClient = {
        ping: mockPing,
        query: mockQuery,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(screen.getByText(/24.1.2.5/)).toBeInTheDocument();
      });
    });

    it("should call toast.success on successful connection", async () => {
      const user = userEvent.setup();
      const mockVersionResult = {
        json: vi.fn().mockResolvedValue({
          data: [{ "version()": "23.8.1.1" }],
        }),
      };
      const mockPing = vi.fn().mockResolvedValue(undefined);
      const mockQuery = vi.fn().mockResolvedValue(mockVersionResult);
      const mockClient = {
        ping: mockPing,
        query: mockQuery,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
        const calls = (toast.success as any).mock.calls;
        expect(calls[0][0]).toContain("Connection successful");
      });
    });

    it("should create client with correct parameters on success", async () => {
      const user = userEvent.setup();
      const mockVersionResult = {
        json: vi.fn().mockResolvedValue({
          data: [{ "version()": "23.8.1.1" }],
        }),
      };
      const mockPing = vi.fn().mockResolvedValue(undefined);
      const mockQuery = vi.fn().mockResolvedValue(mockVersionResult);
      const mockClient = {
        ping: mockPing,
        query: mockQuery,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");
      const passwordInput = screen.getByPlaceholderText("Enter password");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "testuser");
      await user.type(passwordInput, "testpass");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockCreateClient).toHaveBeenCalledWith({
          url: "http://localhost:8123",
          username: "testuser",
          password: "testpass",
          request_timeout: 30000,
          pathname: undefined,
        });
      });
    });

    it("should call ping on client", async () => {
      const user = userEvent.setup();
      const mockVersionResult = {
        json: vi.fn().mockResolvedValue({
          data: [{ "version()": "23.8.1.1" }],
        }),
      };
      const mockPing = vi.fn().mockResolvedValue(undefined);
      const mockQuery = vi.fn().mockResolvedValue(mockVersionResult);
      const mockClient = {
        ping: mockPing,
        query: mockQuery,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockPing).toHaveBeenCalled();
      });
    });

    it("should query version on successful ping", async () => {
      const user = userEvent.setup();
      const mockVersionResult = {
        json: vi.fn().mockResolvedValue({
          data: [{ "version()": "23.8.1.1" }],
        }),
      };
      const mockPing = vi.fn().mockResolvedValue(undefined);
      const mockQuery = vi.fn().mockResolvedValue(mockVersionResult);
      const mockClient = {
        ping: mockPing,
        query: mockQuery,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockQuery).toHaveBeenCalledWith({
          query: "SELECT version()",
        });
      });
    });
  });

  describe("Failed Connection Test", () => {
    it("should display error message on failed connection", async () => {
      const user = userEvent.setup();
      const mockError = new Error("Authentication failed");
      const mockPing = vi.fn().mockRejectedValue(mockError);
      const mockClient = {
        ping: mockPing,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      // Error message should be displayed
      await waitFor(() => {
        expect(screen.getByText(/Authentication failed/)).toBeInTheDocument();
      });
    });

    it("should display error message in red-styled container", async () => {
      const user = userEvent.setup();
      const mockError = new Error("Connection error");
      const mockPing = vi.fn().mockRejectedValue(mockError);
      const mockClient = {
        ping: mockPing,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      // Error message should be displayed - verify by checking the presence of error content
      await waitFor(() => {
        const allElements = document.querySelectorAll("div");
        const errorElement = Array.from(allElements).find(
          (el) => el.className && el.className.includes("bg-red-50")
        );
        expect(errorElement).toBeDefined();
      });
    });

    it("should display troubleshooting tips on error", async () => {
      const user = userEvent.setup();
      const mockError = {
        message: "Unauthorized",
        response: { status: 401 },
      };
      const mockPing = vi.fn().mockRejectedValue(mockError);
      const mockClient = {
        ping: mockPing,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(screen.getByText(/Troubleshooting tips/i)).toBeInTheDocument();
      });
    });

    it("should call toast.error on failed connection", async () => {
      const user = userEvent.setup();
      const mockError = new Error("Connection failed");
      const mockPing = vi.fn().mockRejectedValue(mockError);
      const mockClient = {
        ping: mockPing,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it("should handle 401 authentication error", async () => {
      const user = userEvent.setup();
      const mockError = {
        message: "Unauthorized",
        response: { status: 401 },
      };
      const mockPing = vi.fn().mockRejectedValue(mockError);
      const mockClient = {
        ping: mockPing,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(screen.getByText(/Authentication failed/)).toBeInTheDocument();
      });
    });

    it("should handle network error", async () => {
      const user = userEvent.setup();
      const mockError = {
        message: "ECONNREFUSED",
      };
      const mockPing = vi.fn().mockRejectedValue(mockError);
      const mockClient = {
        ping: mockPing,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });

  describe("Form Validation Integration", () => {
    it("should not test connection with empty name", async () => {
      const user = userEvent.setup();

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      expect(testButton).toBeDisabled();
    });

    it("should not test connection with invalid URL", async () => {
      const user = userEvent.setup();

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "not-a-valid-url");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      expect(testButton).toBeDisabled();
    });

    it("should not test connection with empty username", async () => {
      const user = userEvent.setup();

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      expect(testButton).toBeDisabled();
    });

    it("should enable test button when form becomes valid", async () => {
      const user = userEvent.setup();

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      let testButton = screen.getByRole("button", { name: /Test Connection/i });
      expect(testButton).toBeDisabled();

      // Fill in name
      await user.type(nameInput, "Test");
      testButton = screen.getByRole("button", { name: /Test Connection/i });
      expect(testButton).toBeDisabled();

      // Fill in URL
      await user.type(urlInput, "http://localhost:8123");
      testButton = screen.getByRole("button", { name: /Test Connection/i });
      expect(testButton).toBeDisabled();

      // Fill in username
      await user.type(usernameInput, "default");
      testButton = screen.getByRole("button", { name: /Test Connection/i });
      expect(testButton).not.toBeDisabled();
    });
  });

  describe("URL Handling", () => {
    it("should strip trailing slashes from URL", async () => {
      const user = userEvent.setup();
      const mockVersionResult = {
        json: vi.fn().mockResolvedValue({
          data: [{ "version()": "23.8.1.1" }],
        }),
      };
      const mockPing = vi.fn().mockResolvedValue(undefined);
      const mockQuery = vi.fn().mockResolvedValue(mockVersionResult);
      const mockClient = {
        ping: mockPing,
        query: mockQuery,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123///");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockCreateClient).toHaveBeenCalledWith(
          expect.objectContaining({
            url: "http://localhost:8123",
          })
        );
      });
    });

    it("should use custom path when advanced settings are enabled", async () => {
      const user = userEvent.setup();
      const mockVersionResult = {
        json: vi.fn().mockResolvedValue({
          data: [{ "version()": "23.8.1.1" }],
        }),
      };
      const mockPing = vi.fn().mockResolvedValue(undefined);
      const mockQuery = vi.fn().mockResolvedValue(mockVersionResult);
      const mockClient = {
        ping: mockPing,
        query: mockQuery,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      // Open advanced settings
      const advancedButton = screen.getByRole("button", { name: /Show Advanced Settings/i });
      await user.click(advancedButton);

      // Enable custom path
      const useAdvancedCheckbox = screen.getByLabelText("Use custom path");
      await user.click(useAdvancedCheckbox);

      // Fill custom path
      const customPathInput = screen.getByPlaceholderText("e.g., /clickhouse");
      await user.type(customPathInput, "/custom");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockCreateClient).toHaveBeenCalledWith(
          expect.objectContaining({
            pathname: "/custom",
          })
        );
      });
    });

    it("should not use pathname when custom path is disabled", async () => {
      const user = userEvent.setup();
      const mockVersionResult = {
        json: vi.fn().mockResolvedValue({
          data: [{ "version()": "23.8.1.1" }],
        }),
      };
      const mockPing = vi.fn().mockResolvedValue(undefined);
      const mockQuery = vi.fn().mockResolvedValue(mockVersionResult);
      const mockClient = {
        ping: mockPing,
        query: mockQuery,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockCreateClient).toHaveBeenCalledWith(
          expect.objectContaining({
            pathname: undefined,
          })
        );
      });
    });
  });

  describe("Request Timeout Handling", () => {
    it("should use default timeout of 30000ms", async () => {
      const user = userEvent.setup();
      const mockVersionResult = {
        json: vi.fn().mockResolvedValue({
          data: [{ "version()": "23.8.1.1" }],
        }),
      };
      const mockPing = vi.fn().mockResolvedValue(undefined);
      const mockQuery = vi.fn().mockResolvedValue(mockVersionResult);
      const mockClient = {
        ping: mockPing,
        query: mockQuery,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockCreateClient).toHaveBeenCalledWith(
          expect.objectContaining({
            request_timeout: 30000,
          })
        );
      });
    });
  });

  describe("Password Handling", () => {
    it("should include password in client creation", async () => {
      const user = userEvent.setup();
      const mockVersionResult = {
        json: vi.fn().mockResolvedValue({
          data: [{ "version()": "23.8.1.1" }],
        }),
      };
      const mockPing = vi.fn().mockResolvedValue(undefined);
      const mockQuery = vi.fn().mockResolvedValue(mockVersionResult);
      const mockClient = {
        ping: mockPing,
        query: mockQuery,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");
      const passwordInput = screen.getByPlaceholderText("Enter password");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "testuser");
      await user.type(passwordInput, "mypassword");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockCreateClient).toHaveBeenCalledWith(
          expect.objectContaining({
            password: "mypassword",
          })
        );
      });
    });

    it("should use empty password when not provided", async () => {
      const user = userEvent.setup();
      const mockVersionResult = {
        json: vi.fn().mockResolvedValue({
          data: [{ "version()": "23.8.1.1" }],
        }),
      };
      const mockPing = vi.fn().mockResolvedValue(undefined);
      const mockQuery = vi.fn().mockResolvedValue(mockVersionResult);
      const mockClient = {
        ping: mockPing,
        query: mockQuery,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "testuser");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockCreateClient).toHaveBeenCalledWith(
          expect.objectContaining({
            password: "",
          })
        );
      });
    });
  });

  describe("Message Display", () => {
    it("should clear previous success message when testing again", async () => {
      const user = userEvent.setup();
      const mockVersionResult = {
        json: vi.fn().mockResolvedValue({
          data: [{ "version()": "23.8.1.1" }],
        }),
      };
      const mockPing = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Connection error"));
      const mockQuery = vi.fn().mockResolvedValue(mockVersionResult);
      const mockClient = {
        ping: mockPing,
        query: mockQuery,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      // First successful test
      let testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(screen.getByText(/Connected successfully/)).toBeInTheDocument();
      });

      // Second test that fails
      testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      // Previous success message should be replaced with error
      await waitFor(() => {
        expect(screen.queryByText(/Connected successfully/)).not.toBeInTheDocument();
        expect(screen.getByText(/Connection error/)).toBeInTheDocument();
      });
    });

    it("should display complete error message with newlines for troubleshooting tips", async () => {
      const user = userEvent.setup();
      const mockError = {
        message: "Connection failed",
        response: { status: 502 },
      };
      const mockPing = vi.fn().mockRejectedValue(mockError);
      const mockClient = {
        ping: mockPing,
      };
      mockCreateClient.mockReturnValue(mockClient as any);

      render(
        <ConnectionForm
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByPlaceholderText("My ClickHouse Server");
      const urlInput = screen.getByPlaceholderText("https://your-clickhouse-host:8123");
      const usernameInput = screen.getByPlaceholderText("default");

      await user.type(nameInput, "Test");
      await user.type(urlInput, "http://localhost:8123");
      await user.type(usernameInput, "default");

      const testButton = screen.getByRole("button", { name: /Test Connection/i });
      await user.click(testButton);

      await waitFor(() => {
        const errorElement = screen.getByText(/Cannot reach the ClickHouse server/);
        expect(errorElement).toBeInTheDocument();
        expect(errorElement.closest("div")).toHaveClass("whitespace-pre-line");
      });
    });
  });
});
